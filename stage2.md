# Stage 2

# Persistent Storage Design

## 1. Database Choice

**Recommendation: PostgreSQL (a relational/SQL database) as the primary store, paired with Redis for unread counters and real-time fan-out.**

Reasoning:

- **Access patterns are predictable and relational.** Notifications belong to a user, have a fixed, well-understood set of fields, and are queried mainly by `userId` plus filters (`isRead`, `type`, time range) with pagination — exactly what an indexed relational table handles well.
- **Strong consistency for read/unread state matters.** "Mark as read" and "mark all as read" are state transitions that should not race or be lost; a relational DB with transactions gives reliable read-after-write behavior, important when a user marks something read on one device and expects it reflected on another.
- **Schema is stable but has some variability per type.** Most fields (id, user, type, title, body, timestamps, read state) are common to every notification; type-specific extra data is naturally modeled with a `JSONB` column rather than a separate table per notification type. PostgreSQL's `JSONB` gives schema flexibility without giving up SQL querying and indexing.
- **Operational maturity.** PostgreSQL has mature support for partitioning, indexing strategies, replication, and managed offerings, which matters once notification volume grows into the hundreds of millions of rows.
- **Redis as a companion, not a replacement.** Redis is used for: (a) an unread-count cache so `GET /unread-count` is O(1) instead of a `COUNT(*)` scan, and (b) the pub/sub backbone that fans out new notifications to WebSocket/SSE connections in real time (Stage 1, section 5). Redis is not used as the system of record since it isn't durable enough for the canonical notification history.

A document store (e.g. MongoDB) was considered, since notifications are somewhat document-like, but was not chosen as primary store because the access patterns (filter + paginate + count by user, frequent small updates to `isRead`) are well served by relational indexing, and the transactional guarantees of SQL are simpler to reason about than eventual-consistency tradeoffs.

## 2. Database Schema

```sql
CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    public_id       VARCHAR(32) NOT NULL UNIQUE,      -- e.g. "ntf_8f3a1c", exposed in the API
    user_id         BIGINT NOT NULL,
    type            VARCHAR(64) NOT NULL,              -- e.g. 'order_update', 'mention', 'system'
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    priority        VARCHAR(16) NOT NULL DEFAULT 'normal',  -- 'low' | 'normal' | 'high'
    action_url      VARCHAR(512),
    metadata        JSONB NOT NULL DEFAULT '{}',       -- type-specific extra fields
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Most common access pattern: "this user's notifications, newest first, optionally filtered by status"
CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- Speeds up unread-count and unread-list queries specifically
CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE is_read = FALSE;

CREATE INDEX idx_notifications_user_type
    ON notifications (user_id, type);

CREATE TABLE notification_preferences (
    user_id           BIGINT PRIMARY KEY,
    channels          JSONB NOT NULL DEFAULT '{"inApp": true, "email": true, "push": false}',
    categories        JSONB NOT NULL DEFAULT '{}',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notes:

- `public_id` is a separate, opaque identifier exposed via the API (matching the `ntf_...` format from Stage 1) so internal auto-incrementing `id` values are never leaked externally.
- `metadata JSONB` holds type-specific fields (e.g. `{"orderId": "4521"}`) without requiring a migration every time a new notification type is introduced.
- The partial index `WHERE is_read = FALSE` keeps the unread-focused index small, since in steady state most historical notifications end up read, but unread lookups are the most latency-sensitive ones (badge counts, unread lists).
- `user_id` references a `users` table (outside this system's scope), enforced at the application layer or with a `REFERENCES` constraint depending on whether the user service shares the same database.

## 3. Problems as Data Volume Increases, and Mitigations

| Problem | Why it happens | Mitigation |
|---|---|---|
| Table growth slows queries and bloats indexes | A single ever-growing table increases index maintenance cost, vacuum time, and storage. | **Partition by time** (e.g. monthly range partitions on `created_at`) using native PostgreSQL partitioning. Recent partitions stay small and fast; old ones can be compressed, archived, or dropped. |
| Hot rows / write contention on busy users or bulk events | Bursts of notifications (e.g. broadcast announcements) create write spikes on the same index pages. | Use sequential `BIGSERIAL` IDs (avoiding random-UUID index fragmentation); batch-insert bulk system notifications rather than one `INSERT` per recipient in the hot path. |
| Unbounded growth of old "read" notifications | Users rarely browse far back, but rows are kept forever. | Implement a **retention policy**: archive or delete notifications older than N days/months (configurable per type), or move them to cold storage / a data warehouse, keeping the hot table lean. |
| Slow `COUNT(*)` for unread badges at scale | Counting unread rows per user gets expensive as row counts and concurrency grow. | Maintain a **denormalized unread counter in Redis**, incremented/decremented on write/read events, with periodic reconciliation against the DB. |
| Single primary can't serve all read traffic | Notification lists are read far more often than written, once the user base grows. | Add **PostgreSQL read replicas** and route `GET` endpoints to replicas, keeping writes on the primary. |
| Single database becomes a scaling ceiling | At very large scale, even a partitioned, replicated single instance hits limits. | **Shard by `user_id`** (hash-based sharding across PostgreSQL clusters); route at the application/data-access layer via a deterministic shard key. |
| Real-time fan-out doesn't scale with one Redis instance | A single Redis pub/sub node struggles under very large connection counts and message throughput. | Move to **Redis Cluster** or a dedicated broker (Kafka, NATS) for fan-out, and horizontally scale the WebSocket/SSE gateway layer behind a load balancer with a shared pub/sub backbone. |

## 4. Queries Backing Each REST API Endpoint (Stage 1)

### `GET /api/v1/notifications` (list, with filters and pagination)

```sql
SELECT public_id, type, title, body, is_read, priority, created_at, read_at, action_url, metadata
FROM notifications
WHERE user_id = $1
  AND ($2::boolean IS NULL OR is_read = $2)        -- $2 = false "unread", true "read", NULL "all"
  AND ($3::varchar IS NULL OR type = $3)            -- optional type filter
  AND (created_at, id) < ($4, $5)                   -- cursor: created_at/id of last seen row
ORDER BY created_at DESC, id DESC
LIMIT $6;
```

### `GET /api/v1/notifications/{notificationId}`

```sql
SELECT public_id, type, title, body, is_read, priority, created_at, read_at, action_url, metadata
FROM notifications
WHERE user_id = $1 AND public_id = $2;
```

### `GET /api/v1/notifications/unread-count`

```sql
-- Used to seed/reconcile the Redis counter, not on the request hot path
SELECT COUNT(*) AS unread_count
FROM notifications
WHERE user_id = $1 AND is_read = FALSE;
```

### `PATCH /api/v1/notifications/{notificationId}` (mark as read)

```sql
UPDATE notifications
SET is_read = TRUE, read_at = now(), updated_at = now()
WHERE user_id = $1 AND public_id = $2 AND is_read = FALSE
RETURNING public_id, is_read, read_at;
```

### `POST /api/v1/notifications/mark-all-read`

```sql
UPDATE notifications
SET is_read = TRUE, read_at = now(), updated_at = now()
WHERE user_id = $1
  AND is_read = FALSE
  AND ($2::varchar IS NULL OR type = $2)
RETURNING public_id;
```

### `DELETE /api/v1/notifications/{notificationId}`

```sql
DELETE FROM notifications WHERE user_id = $1 AND public_id = $2;
```

### `DELETE /api/v1/notifications` (delete all)

```sql
DELETE FROM notifications WHERE user_id = $1;
```

### `GET /api/v1/notification-preferences`

```sql
SELECT channels, categories FROM notification_preferences WHERE user_id = $1;
```

### `PUT /api/v1/notification-preferences`

```sql
INSERT INTO notification_preferences (user_id, channels, categories, updated_at)
VALUES ($1, $2::jsonb, $3::jsonb, now())
ON CONFLICT (user_id)
DO UPDATE SET channels = EXCLUDED.channels,
              categories = EXCLUDED.categories,
              updated_at = now()
RETURNING channels, categories;
```

### `POST /api/v1/internal/notifications` (create)

```sql
INSERT INTO notifications (public_id, user_id, type, title, body, priority, action_url, metadata)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
RETURNING public_id, created_at;
```

## 5. NoSQL Alternative (for comparison)

If a document store were used instead (e.g. MongoDB):

```javascript
// Document shape
{
  _id: ObjectId(),
  publicId: "ntf_8f3a1c",
  userId: "usr_5521",
  type: "order_update",
  title: "Your order has shipped",
  body: "Order #4521 shipped and is on its way.",
  priority: "normal",
  actionUrl: "/orders/4521",
  metadata: { orderId: "4521" },
  isRead: false,
  readAt: null,
  createdAt: ISODate("2026-06-30T10:15:00Z")
}

// Indexes
db.notifications.createIndex({ userId: 1, createdAt: -1 })
db.notifications.createIndex({ userId: 1, isRead: 1, createdAt: -1 })

// List unread, paginated
db.notifications.find({ userId: "usr_5521", isRead: false })
  .sort({ createdAt: -1 }).limit(20)

// Mark as read
db.notifications.updateOne(
  { userId: "usr_5521", publicId: "ntf_8f3a1c" },
  { $set: { isRead: true, readAt: new Date() } }
)

// Mark all as read
db.notifications.updateMany(
  { userId: "usr_5521", isRead: false },
  { $set: { isRead: true, readAt: new Date() } }
)
```

Included for comparison; PostgreSQL remains the recommended choice for the reasons in section 1.


# Stage 3

# Query Performance Analysis at Scale

## 1. The Query in Question

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

## 2. Is It Accurate?

Functionally, yes — it correctly returns the unread notifications belonging to student `1042`, oldest first. "Accurate" and "performant" are different questions, though, and this query is accurate but not performant at the current scale (50,000 students, 5,000,000 notifications, averaging 100 notifications/student).

There are also two correctness/efficiency smells worth flagging even before talking about indexes:

- **`SELECT *`** pulls every column, including `body` (likely a large `TEXT` field) and `metadata` (`JSONB`), even though the API response (per the Stage 1 contract) only needs a subset of fields. This adds unnecessary I/O and network payload per row.
- **No `LIMIT`.** If a student has accumulated hundreds of unread notifications, this returns all of them in one shot, which doesn't match the paginated `GET /api/v1/notifications` contract from Stage 1 and is wasteful for both the DB and the API response.

## 3. Why Is It Slow?

Without a supporting index, PostgreSQL/MySQL has no way to jump directly to student `1042`'s rows, so it falls back to a **full table scan**: it reads all ~5,000,000 rows, evaluates `studentID = 1042 AND isRead = false` on each one, then sorts the small number of matches by `createdAt`.

Cost breakdown:

- **I/O cost**: scanning 5,000,000 rows means reading effectively the entire table (and its TOAST'ed large columns, like `body`/`metadata`) off disk or out of buffer cache, instead of touching only the ~100 rows that belong to student 1042.
- **CPU cost**: every one of those 5,000,000 rows has its `WHERE` predicate evaluated, even though only a tiny fraction match.
- **Sort cost**: although the result set per student is small, the engine still performs a sort step on the filtered rows since there's no index that already orders by `createdAt`.
- **Scaling trend**: a full table scan is **O(n)** in the total row count, not in the size of the result set. As notifications keep growing (more students, more notifications per student, system-generated bulk notifications), this query gets linearly slower for every student's lookup — exactly the kind of unread-list query that's supposed to be cheap and frequent (it backs a badge/notification-bell UI that's likely polled or loaded often).

## 4. What Would I Change?

**Add a composite index matching the query's filter + sort columns, in the right column order:**

```sql
CREATE INDEX idx_notifications_student_unread_created
    ON notifications (studentID, isRead, createdAt);
```

Why this specific shape:

- **Leftmost column `studentID`** lets the database jump directly to one student's rows instead of scanning the whole table — this is the highest-selectivity, most-used filter (every request is scoped to one student).
- **Second column `isRead`** narrows further, within that student's rows, to just the unread ones.
- **Third column `createdAt`** means the matching rows are already stored in the index in the exact order the query asks for (`ORDER BY createdAt ASC`), so the database can avoid a separate sort step entirely.

This turns the query from an O(n) full scan into an **O(log n + k)** index range scan, where `k` is the number of unread notifications for that student (typically a handful to a few dozen), which is dramatically cheaper and stays fast even as the total table grows into the tens of millions of rows.

Even better — matching the actual access pattern from Stage 2's schema, where this is a **partial index** (since most queries on this table only care about unread rows):

```sql
CREATE INDEX idx_notifications_student_unread_created
    ON notifications (studentID, createdAt)
    WHERE isRead = false;
```

A partial index is smaller (it only indexes the subset of rows where `isRead = false`, which shrinks over time relative to the full table as old notifications get marked read), faster to maintain on writes, and directly matches this query's `WHERE isRead = false` clause.

I'd also change the application/API layer to:

- Select only the columns the API contract needs instead of `SELECT *`.
- Add a `LIMIT` (and cursor-based pagination, per the Stage 1 contract) instead of returning an unbounded result set.

### Likely Computation Cost, Before vs. After

| | Without index | With composite/partial index |
|---|---|---|
| Rows examined | ~5,000,000 (full table) | ~100 (just that student's rows) or fewer (just unread ones) |
| Big-O behavior | O(n) — scales with total notification count | O(log n + k) — scales with that student's unread count |
| Extra sort step | Yes (separate sort after filtering) | No (index already sorted by `createdAt`) |
| Disk/cache pressure | High — touches most of the table, including large TOAST'ed columns via `SELECT *` | Low — touches only the relevant index entries and a small number of heap rows |
| Trend as data grows | Gets worse linearly with total notifications across all students | Stays roughly constant per student, since it depends on that student's row count, not the table's |

## 5. Is "Add Indexes on Every Column" Good Advice?

No — well-intentioned, but not effective, and it would likely make things worse rather than better. Reasons:

- **Indexes aren't free.** Every additional index has to be updated on every `INSERT`, `UPDATE`, and `DELETE` to the table. With 5,000,000+ rows and growing, and given notifications are write-heavy (every new event for every student is an insert, and every "mark as read" is an update), indexing every column would significantly slow down writes and increase storage (each index roughly duplicates the indexed columns plus overhead).
- **Single-column indexes don't help multi-column filters efficiently.** An index on `studentID` alone and a separate index on `isRead` alone don't combine as well as one well-ordered composite index on `(studentID, isRead, createdAt)`; the database would have to bitmap-AND two separate index scans rather than doing one efficient range scan, and neither index alone helps with the `ORDER BY`.
- **Low-selectivity columns gain little from indexing.** `isRead` is a boolean with only two values; an index on `isRead` alone is not very selective (it might match millions of rows) and the query planner may simply ignore it in favor of a sequential scan anyway.
- **Indexes on rarely filtered/sorted columns are pure overhead.** If a column like `body` or `metadata` is never used in a `WHERE`/`ORDER BY`/`JOIN`, indexing it (especially `JSONB`/`TEXT` columns, which need more specialized index types like `GIN`, not plain B-tree) adds maintenance cost with no query benefit.

The effective approach is **targeted indexing**: build composite indexes that match the actual `WHERE` + `ORDER BY` shape of the application's real queries (as derived from the API contract in Stage 1), not a blanket index on every column.

## 6. Query: Students Who Got a Placement Notification in the Last 7 Days

Using the `notificationType` column (enum values: `Event`, `Result`, `Placement`):

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= now() - INTERVAL '7 days'
ORDER BY studentID;
```

If the full notification rows (not just the distinct student IDs) are needed instead:

```sql
SELECT studentID, public_id, title, body, createdAt
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= now() - INTERVAL '7 days'
ORDER BY createdAt DESC;
```

**Supporting index**, matching this query's filter + range condition:

```sql
CREATE INDEX idx_notifications_type_created
    ON notifications (notificationType, createdAt);
```

This lets the database go directly to the `Placement` slice of the index and then range-scan just the last 7 days within it, rather than scanning the whole table — the same indexing principle as section 4, applied to a different filter shape (equality on `notificationType`, range on `createdAt`, instead of equality on `studentID`/`isRead`).


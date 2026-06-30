# Stage 4

# Reducing Database Load From Per-Page-Load Fetching

## 1. The Problem

Every page load triggers a fresh `GET /api/v1/notifications` (and likely an unread-count check) straight to the database for every student, even when nothing has changed since the last load. At 50,000 students this turns into a very high, mostly redundant read volume hitting PostgreSQL directly on every navigation, which is what's overwhelming the DB and slowing down the experience. The fix isn't one single change — it's a layered set of strategies, each with its own tradeoffs.

## 2. Strategy 1 — Cache the Unread Count and Recent List in Redis

Instead of querying the DB on every page load, cache per-student data in Redis with a short TTL or event-driven invalidation:

```
Key: unread-count:{studentId}        → integer, updated on read/write events
Key: notifications:recent:{studentId} → serialized list of the most recent N notifications
```

- On notification creation: increment the Redis counter and push the new notification onto a capped Redis list (or invalidate the cached list).
- On mark-as-read: decrement the counter.
- `GET /unread-count` and the first page of `GET /notifications` are served from Redis, falling back to PostgreSQL only on a cache miss (e.g. cold start, eviction).

**Tradeoffs:**
- *Pro*: Removes the vast majority of read load from the DB, since unread-count and "first page" are the most frequently hit endpoints (every page load).
- *Pro*: Redis reads are sub-millisecond and easily handle very high request volume.
- *Con*: Adds a second system to operate and keep consistent with the source of truth; a bug in increment/decrement logic can let the cached counter drift from reality (mitigated by periodic reconciliation against the DB, as already noted in Stage 2).
- *Con*: Slightly more complex write path (every create/read-update now also touches Redis, not just Postgres).

## 3. Strategy 2 — Stop Fetching on Every Page Load: Push Instead of Pull

The deeper issue is the *pattern* of fetching on every page load at all. Given the real-time mechanism already designed in Stage 1 (WebSocket/SSE), the front end shouldn't need to re-fetch from the API on every navigation:

- On login / app load, fetch notifications **once** and cache them in client-side state (e.g. a store/context in the front-end app).
- Keep the WebSocket/SSE connection open for the session; new notifications and read-state changes arrive as push events and update the client's in-memory state directly.
- Subsequent page loads within the same session reuse the already-fetched, already-current client-side state instead of re-querying the API.

**Tradeoffs:**
- *Pro*: This is the single biggest lever — it changes the access pattern from "O(page loads)" database hits to "O(sessions)" database hits, which is a large reduction at scale.
- *Pro*: Better user experience too — instant display from local state instead of a network round trip on every navigation.
- *Con*: Requires front-end work and a bit more state-management complexity (keeping client state in sync with push events, handling reconnects per Stage 1 section 5.1).
- *Con*: If the WebSocket/SSE connection drops and reconnects, the client must reconcile (re-fetch once) to avoid showing stale data — so this doesn't eliminate DB reads entirely, just collapses many redundant ones into occasional reconciliation reads.

## 4. Strategy 3 — HTTP Caching Headers for the REST Endpoint

For clients/scenarios that do still call the REST API repeatedly (e.g. a page reload, not just in-session navigation), add standard HTTP caching semantics:

- Return an `ETag` on `GET /api/v1/notifications` and `GET /unread-count` (already part of the header contract from Stage 1).
- The client sends `If-None-Match` on the next request; if nothing changed, the server returns `304 Not Modified` with no body, avoiding both DB work (if the ETag can be derived from the cached Redis value) and most of the response payload.

**Tradeoffs:**
- *Pro*: Cheap to add on top of the existing contract; works well for the "reload the page, nothing's new" case which is extremely common.
- *Con*: Doesn't help on the very first load of a session, and the server still has to compute/compare the ETag cheaply (ideally from Redis, not by re-querying Postgres), so it's complementary to, not a substitute for, Strategy 1.

## 5. Strategy 4 — Read Replicas for Whatever Read Load Remains

Even after caching and push-based delivery dramatically cut DB traffic, some read load remains (cache misses, cold starts, reconciliation after reconnects, deep pagination beyond what's cached). Route these reads to **PostgreSQL read replicas** (as already proposed in Stage 2) rather than the primary, so remaining read traffic doesn't compete with write traffic (new notification inserts, read-state updates) for primary capacity.

**Tradeoffs:**
- *Pro*: Horizontally scalable for read throughput; isolates writes from reads.
- *Con*: Replicas are typically eventually consistent (replication lag), so a student could briefly see slightly stale data right after an update — acceptable for notifications (a few hundred ms of staleness on a non-critical-path feature), but worth being explicit about.
- *Con*: Additional infrastructure and operational cost (replica provisioning, monitoring lag).

## 6. Strategy 5 — Rate-Limit / Debounce Aggressive Polling Fallbacks

If any client still falls back to polling (Stage 1, section 5.3) instead of using the WebSocket/SSE connection, that fallback should be rate-limited (e.g. no more than once every 30–60 seconds per student) and ideally itself served from the Redis cache rather than the DB, so a misbehaving or fallback client can't single-handedly generate excessive DB load.

**Tradeoffs:**
- *Pro*: Protects the DB from worst-case client behavior (e.g. a buggy tab polling every second).
- *Con*: Adds a small amount of staleness for clients relying on the fallback rather than the real-time channel — an acceptable tradeoff since the fallback is explicitly the degraded path, not the primary one.

## 7. Recommended Combination

In priority order: (1) move to push-based delivery via the existing WebSocket/SSE channel so most page loads don't hit the API at all; (2) cache unread-count and the first page of notifications in Redis for whatever does still call the API; (3) add `ETag`/`304` support for cheap "nothing changed" responses; (4) route remaining reads to replicas; (5) rate-limit any polling fallback. Together these shift the system from "every page load = a Postgres query" to "Postgres is touched mainly on writes and occasional cache misses," which is what resolves the overwhelmed-DB / bad-UX problem described in this stage.


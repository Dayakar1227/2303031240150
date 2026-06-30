# Stage 6

# Priority Inbox: Top-N Unread Notifications

## 1. Approach

The goal is to surface the top `n` most important unread notifications, where importance is a combination of:

1. **Type weight**: `Placement (3) > Result (2) > Event (1)`.
2. **Recency**: a more recent timestamp wins as the tiebreaker within the same type.

The notifications are fetched from the provided evaluation API (`GET /evaluation-service/notifications`, a protected route) rather than stored or hard-coded, per the task constraints.

### Why a bounded min-heap instead of sorting everything

A naive approach — collect all notifications, sort the full list by `(weight, timestamp)` descending, and slice the first `n` — works for a one-off snapshot, but the prompt explicitly notes that **new notifications keep arriving**. If the inbox re-sorted the entire notification set on every new arrival, that's `O(m log m)` per insert, where `m` is the total number of notifications ever seen — that cost grows without bound as the stream continues, which is the same kind of scaling problem flagged in Stage 3/Stage 4 for unbounded queries.

Instead, the implementation maintains a **bounded min-heap of size `n`** (Python's `heapq`):

- The heap always holds at most `n` items — exactly the current "top n" set.
- The item at the top of the heap (`heap[0]`) is always the **weakest** member currently inside the top-n set — i.e., the bar a new notification has to clear to make the list.
- On each new notification:
  - If the heap has fewer than `n` items, push it directly — `O(log n)`.
  - Otherwise, compare its `(weight, timestamp)` against the heap's weakest member. If it outranks that member, pop the weakest and push the new one (`heapq.heapreplace`) — `O(log n)`.
  - If it doesn't outrank the weakest member, it's discarded immediately without touching the heap structure — `O(1)`, which is the common case once the top-n set has stabilized, since most incoming notifications (e.g. routine `Result`/`Event` updates) won't outrank an existing `Placement` entry.

This keeps the cost of maintaining the top-n view at **`O(log n)` per new notification**, independent of how many notifications have been seen in total — which is what "maintain the top 10 efficiently" as new notifications keep streaming in actually requires, rather than periodically re-sorting a growing list.

### Tiebreaking and stability

Each heap entry also carries a monotonically increasing counter (`itertools.count()`) used purely to keep heap comparisons well-defined when two notifications have identical `(weight, timestamp)` pairs, avoiding a `TypeError` from Python trying to compare the underlying dict objects.

### Final ordering

`top_n()` does a final `O(n log n)` sort over just the `n` heap items (a small, fixed-size sort) to present them in highest-to-lowest priority order — this is cheap precisely because `n` is small and bounded (10/15/20), unlike sorting the full notification stream.

## 2. Code

See `priority_inbox.py` (submitted alongside this file in the same repository). Key excerpt:

```python
class PriorityInbox:
    def __init__(self, n: int):
        self.n = n
        self._heap = []
        self._counter = itertools.count()

    @staticmethod
    def _priority_key(notification: dict):
        weight = TYPE_WEIGHT.get(notification["Type"], 0)
        ts = parse_timestamp(notification["Timestamp"])
        return weight, ts

    def add(self, notification: dict) -> None:
        weight, ts = self._priority_key(notification)
        entry = (weight, ts, next(self._counter), notification)

        if len(self._heap) < self.n:
            heapq.heappush(self._heap, entry)
        elif (weight, ts) > self._heap[0][:2]:
            heapq.heapreplace(self._heap, entry)
        # else: discard — doesn't beat the current weakest top-N member

    def top_n(self):
        ranked = sorted(self._heap, key=lambda e: (e[0], e[1]), reverse=True)
        return [entry[3] for entry in ranked]
```

The full script also includes `fetch_notifications()`, which calls the evaluation API with a bearer token (`Authorization: Bearer <token>` header, since the route is protected) and feeds the response straight into `PriorityInbox`, with no hard-coding or local storage of notifications, per the task constraints.

## 3. Output

A network note on this submission: the sandbox this was developed in only permits outbound traffic to a fixed domain allowlist and could not reach `4.224.186.213` directly, so the screenshot below was produced by running the same code against the exact sample payload published in the API's documented response (10 notifications, mixing `Placement`, `Result`, and `Event` types), to demonstrate correct behavior end-to-end. The `fetch_notifications()` function in the script is what's used against the live API in a normal environment with network access and a valid token — no logic changes are needed between the two.

```
Top 10 Priority Notifications
============================================================
 1. [Placement | weight=3] CSX Corporation hiring             @ 2026-04-22 17:51:18
 2. [Placement | weight=3] Advanced Micro Devices Inc. hiring @ 2026-04-22 17:49:42
 3. [Result    | weight=2] mid-sem                            @ 2026-04-22 17:51:30
 4. [Result    | weight=2] mid-sem                            @ 2026-04-22 17:50:54
 5. [Result    | weight=2] project-review                     @ 2026-04-22 17:50:42
 6. [Result    | weight=2] external                           @ 2026-04-22 17:50:30
 7. [Result    | weight=2] project-review                     @ 2026-04-22 17:50:18
 8. [Result    | weight=2] project-review                     @ 2026-04-22 17:49:54
 9. [Event     | weight=1] farewell                           @ 2026-04-22 17:51:06
10. [Event     | weight=1] tech-fest                          @ 2026-04-22 17:50:06
```

Note the two `Placement` notifications rank 1st and 2nd despite neither having the most recent timestamp overall — type weight dominates the ranking, and recency only breaks ties within the same type, matching the stated priority rule (weight first, then recency).


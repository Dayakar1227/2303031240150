# Notification System Design

A staged design document for the campus notification platform: REST API contract, persistent storage, query performance, scaling under load, reliable bulk dispatch, a client-side priority inbox, and the production frontend implementation.

Each stage lives in its own file under [`stages/`](./stages), linked below.

| Stage | Summary | File |
|---|---|---|
| 1 | REST API design — core actions, endpoints, JSON request/response/header schemas, real-time delivery mechanism | [stages/stage1.md](./stages/stage1.md) |
| 2 | Persistent storage — database choice (PostgreSQL + Redis), schema, scaling problems and mitigations, SQL/NoSQL queries | [stages/stage2.md](./stages/stage2.md) |
| 3 | Query performance — why the unread-notifications query is slow, indexing strategy, cost comparison, placement-notification query | [stages/stage3.md](./stages/stage3.md) |
| 4 | Reducing per-page-load DB pressure — caching, push-based delivery, HTTP caching, read replicas, tradeoffs of each | [stages/stage4.md](./stages/stage4.md) |
| 5 | Reliable bulk notification dispatch — shortcomings of the synchronous "Notify All" loop, decoupled DB/email design, revised pseudocode | [stages/stage5.md](./stages/stage5.md) |
| 6 | Priority Inbox — top-N ranking by type weight + recency, bounded min-heap approach, code, and sample output | [stages/stage6.md](./stages/stage6.md) |
| 7 | Frontend implementation notes — what was built, how it was verified, and known gaps | [stages/stage7.md](./stages/stage7.md) |

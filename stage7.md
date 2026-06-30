# Stage 7

# Frontend Implementation Notes

A working React + Material UI app (`notification-app-fe/`) implementing both pages is included alongside this file. Since I didn't have access to the existing repository's scaffolding or prior logging middleware in this session, this was built fresh against the same contract — production-quality, not a prototype — rather than skipped.

## What's included

- **All Notifications page** (`/`) — paginated feed against the live API's `limit`/`page`/`notification_type` query params, with a per-page selector and type filter chips.
- **Priority Inbox page** (`/priority`) — reuses the exact ranking rule from Stage 6 (`utils/priority.js`, `rankTopN`), with a "show top n" selector (10/15/20) and type filter.
- **Logging middleware** (`src/middleware/logging.js`) — wired in at the axios layer so every request from either page passes through one instrumentation point. Stabilized for: responses that never arrive (network down), timeouts, 401/403 logged as warnings rather than errors (an expired token is expected/recoverable, not a bug), and concurrent in-flight requests via per-request correlation IDs so interleaved log lines from overlapping calls can still be matched up.
- **New vs. viewed distinction** — tracked client-side in `localStorage` (`utils/viewedTracker.js`), since the API has no read-state concept. A row is marked viewed once it's actually scrolled into view (via `IntersectionObserver`), not merely fetched — opening the page doesn't silently mark everything read.
- **Auth** — the notifications route is protected; the app never hard-codes a token. A small dismissible token bar lets whoever runs the app paste a bearer token, stored in `localStorage` and attached to every request.
- **Error handling** — every fetch has loading (skeleton rows), error (with retry), and empty states; stale-response races are guarded against when filters change quickly (an older in-flight request can't overwrite a newer one).
- **Styling** — Material UI only, with a custom theme (`src/theme/theme.js`): self-hosted Fraunces/Inter/IBM Plex Mono fonts (via `@fontsource`, bundled — no runtime calls to Google Fonts), and a signature "ribbon" element (a colored left-edge bar per notification type, consistent across both pages) rather than generic MUI cards.
- Runs exclusively on `http://localhost:3000` (`vite.config.js` pins `host`/`port`/`strictPort`).

## Verification performed in this environment

- `npm run build` completes cleanly (no type/import errors).
- `npx oxlint src` — 0 warnings, 0 errors.
- A local mock of the notifications API was used to dev-serve the app and confirm the request/response cycle, pagination, filtering, and ranking logic all behave correctly end-to-end, since the real evaluation API isn't reachable from this sandbox's network allowlist.

## What I could not do from here

- **Push to GitHub.** I don't have write access to any repository; the project is delivered as a zip to be added to the `notification-app-fe` sub-directory and committed/pushed manually.
- **Record a video.** I can't capture screen recordings of a running browser. Running `npm install && npm run dev` and recording both pages (desktop and mobile viewport, via browser dev tools device toolbar) needs to happen on your end before submission.
- **Confirm against the real evaluation API.** Without network access to `4.224.186.213`, behavior against the actual protected endpoint (real auth flow, real pagination counts, real notification volume) should be spot-checked once this is dropped into an environment that can reach it.

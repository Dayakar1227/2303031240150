# notification-app-fe

React + Material UI frontend for the campus notification system: an "All
Notifications" feed and a ranked "Priority Inbox", both backed by the
evaluation API's `GET /evaluation-service/notifications` endpoint
(`limit`, `page`, `notification_type` query params).

## Run

```bash
npm install
npm run dev
```

The app runs exclusively on **http://localhost:3000** (configured in
`vite.config.js`).

## Auth

The notifications route is protected. On first load, the app shows a small
"API token" bar — paste a bearer token there; it's stored in
`localStorage` and attached to every API request automatically. No token
is hard-coded anywhere in the app.

## Structure

```
src/
  middleware/logging.js        axios request/response logging middleware
  services/notificationsApi.js axios client + fetchNotifications()
  utils/priority.js            Placement > Result > Event ranking rule
  utils/viewedTracker.js       read/unread tracking (localStorage)
  hooks/useNotificationsFeed.js  paginated feed for the All page
  hooks/useNotificationPool.js   ranking pool for the Priority page
  components/                  Masthead, NotificationRow, TokenBar, status states
  pages/AllNotificationsPage.jsx
  pages/PriorityInboxPage.jsx
  theme/theme.js                design tokens + MUI theme
```

## Notes

- Styling is Material UI only (custom theme + `sx`); no Tailwind/ShadCN/
  other CSS libraries.
- New vs. already-viewed notifications are tracked client-side via
  `localStorage`, since the API doesn't expose read state. A notification
  is marked viewed once it's been visibly scrolled into view (not merely
  fetched), via `IntersectionObserver`.
- Logging middleware lives at the axios layer (`src/middleware/logging.js`)
  so every request/response from either page passes through one place. It
  handles: no-response network errors, timeouts, 401/403 (logged as a
  warning, not an error, since an expired token is expected/recoverable),
  and concurrent in-flight requests (correlation IDs).

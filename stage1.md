# Stage 1

# Notification System — REST API Design

## 1. Overview

This document defines the REST API contract for a notification platform that allows front-end clients to display, manage, and react to user notifications while logged in. It covers the core actions the platform must support, the endpoint structure, request/response/header schemas, and the mechanism for real-time delivery.

## 2. Core Actions

The notification platform should support the following core actions:

1. **List notifications** — fetch a user's notifications (with pagination, filtering by read/unread status, and type).
2. **Get a single notification** — fetch details of one notification.
3. **Get unread count** — fetch a lightweight count for badge display.
4. **Mark a notification as read** — update the read status of one notification.
5. **Mark all notifications as read** — bulk update.
6. **Delete a notification** — remove a notification for the user.
7. **Delete all notifications** — bulk clear.
8. **Update notification preferences** — let users opt in/out of notification categories or channels.
9. **Create a notification** (server-to-server / internal) — used by backend services to push a new notification into the system.
10. **Subscribe to real-time notifications** — establish a live connection (WebSocket or SSE) to receive notifications as they happen.

## 3. General API Conventions

- Base path: `/api/v1/notifications`
- Resource naming: plural nouns, lowercase, hyphen-separated (`/notification-preferences`, not `/notificationPreferences`).
- All requests/responses use `application/json` unless otherwise noted.
- All endpoints require authentication via a bearer token; notifications are always scoped to the authenticated user (no user ID in the path for self-service endpoints).
- Timestamps are ISO 8601 UTC strings (e.g. `2026-06-30T10:15:00Z`).
- Pagination uses cursor-based parameters (`limit`, `cursor`) returned in the response body.
- Errors follow a consistent envelope (see section 6).

### Common Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer <access_token>` |
| `Content-Type` | For POST/PATCH/PUT | `application/json` |
| `Accept` | Recommended | `application/json` |
| `X-Request-Id` | Optional | Client-generated ID for tracing/correlation |
| `If-Match` | Optional | ETag for optimistic concurrency on updates |

### Common Response Headers

| Header | Description |
|---|---|
| `Content-Type` | `application/json` |
| `X-Request-Id` | Echoed back for correlation with logs |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` | Rate limiting metadata |
| `ETag` | Resource version, used with `If-Match` |

## 4. Endpoints

### 4.1 List Notifications

`GET /api/v1/notifications`

Query parameters:

| Param | Type | Description |
|---|---|---|
| `status` | string | `all` \| `read` \| `unread` (default `all`) |
| `type` | string | Filter by notification type (e.g. `mention`, `system`, `order_update`) |
| `limit` | integer | Page size (default 20, max 100) |
| `cursor` | string | Opaque pagination cursor |

**Response 200**
```json
{
  "data": [
    {
      "id": "ntf_8f3a1c",
      "type": "order_update",
      "title": "Your order has shipped",
      "body": "Order #4521 shipped and is on its way.",
      "isRead": false,
      "priority": "normal",
      "createdAt": "2026-06-30T10:15:00Z",
      "readAt": null,
      "actionUrl": "/orders/4521",
      "metadata": {
        "orderId": "4521"
      }
    }
  ],
  "pagination": {
    "nextCursor": "eyJpZCI6Im50Zl84ZjNhMWMifQ",
    "hasMore": true,
    "limit": 20
  }
}
```

### 4.2 Get a Single Notification

`GET /api/v1/notifications/{notificationId}`

**Response 200**
```json
{
  "data": {
    "id": "ntf_8f3a1c",
    "type": "order_update",
    "title": "Your order has shipped",
    "body": "Order #4521 shipped and is on its way.",
    "isRead": false,
    "priority": "normal",
    "createdAt": "2026-06-30T10:15:00Z",
    "readAt": null,
    "actionUrl": "/orders/4521",
    "metadata": { "orderId": "4521" }
  }
}
```

**Response 404** — see Error Schema (section 6).

### 4.3 Get Unread Count

`GET /api/v1/notifications/unread-count`

**Response 200**
```json
{
  "data": {
    "unreadCount": 7
  }
}
```

### 4.4 Mark a Notification as Read

`PATCH /api/v1/notifications/{notificationId}`

**Request**
```json
{
  "isRead": true
}
```

**Response 200**
```json
{
  "data": {
    "id": "ntf_8f3a1c",
    "isRead": true,
    "readAt": "2026-06-30T10:20:00Z"
  }
}
```

### 4.5 Mark All Notifications as Read

`POST /api/v1/notifications/mark-all-read`

**Request** — empty body, or optional filter:
```json
{
  "type": "order_update"
}
```

**Response 200**
```json
{
  "data": {
    "updatedCount": 12
  }
}
```

### 4.6 Delete a Notification

`DELETE /api/v1/notifications/{notificationId}`

**Response 204** — No content.

### 4.7 Delete All Notifications

`DELETE /api/v1/notifications`

**Response 200**
```json
{
  "data": {
    "deletedCount": 34
  }
}
```

### 4.8 Get / Update Notification Preferences

`GET /api/v1/notification-preferences`

**Response 200**
```json
{
  "data": {
    "channels": {
      "inApp": true,
      "email": true,
      "push": false
    },
    "categories": {
      "orderUpdates": true,
      "mentions": true,
      "marketing": false
    }
  }
}
```

`PUT /api/v1/notification-preferences`

**Request**
```json
{
  "channels": {
    "inApp": true,
    "email": false,
    "push": true
  },
  "categories": {
    "orderUpdates": true,
    "mentions": true,
    "marketing": false
  }
}
```

**Response 200** — returns the updated preferences object (same shape as GET).

### 4.9 Create Notification (Internal / Service-to-Service)

`POST /api/v1/internal/notifications`

Restricted to authenticated backend services (service-to-service auth, e.g. mTLS or a service API key), not exposed to front-end clients.

**Request**
```json
{
  "userId": "usr_5521",
  "type": "order_update",
  "title": "Your order has shipped",
  "body": "Order #4521 shipped and is on its way.",
  "priority": "normal",
  "actionUrl": "/orders/4521",
  "metadata": { "orderId": "4521" }
}
```

**Response 201**
```json
{
  "data": {
    "id": "ntf_8f3a1c",
    "createdAt": "2026-06-30T10:15:00Z"
  }
}
```

## 5. Real-Time Notification Mechanism

To deliver notifications as they happen, the platform exposes a real-time channel in addition to the polling-friendly REST endpoints above.

### 5.1 Recommended approach: WebSocket (with SSE as fallback)

`WSS /api/v1/notifications/stream`

- The client opens a WebSocket connection and authenticates by passing the access token as a query parameter or in the initial handshake message (since browsers can't set custom headers on the WebSocket upgrade request): `wss://api.example.com/api/v1/notifications/stream?token=<access_token>`.
- On connect, the server validates the token and subscribes the connection to that user's notification topic (e.g. via a pub/sub backbone such as Redis Pub/Sub or a message broker).
- When a new notification is created for the user, the server pushes a message over the socket:

```json
{
  "event": "notification.created",
  "data": {
    "id": "ntf_8f3a1c",
    "type": "order_update",
    "title": "Your order has shipped",
    "body": "Order #4521 shipped and is on its way.",
    "isRead": false,
    "priority": "normal",
    "createdAt": "2026-06-30T10:15:00Z",
    "actionUrl": "/orders/4521"
  }
}
```

- Other event types over the same socket: `notification.read` (synced across multiple open tabs/devices), `notification.deleted`, `unread-count.updated`.
- The client should implement reconnect-with-backoff logic, and on reconnect, call `GET /api/v1/notifications/unread-count` and `GET /api/v1/notifications?status=unread` to reconcile any events missed while disconnected.

### 5.2 Fallback: Server-Sent Events (SSE)

`GET /api/v1/notifications/stream` with `Accept: text/event-stream`

- Useful for clients/environments that don't support WebSockets or only need one-way (server-to-client) delivery.
- The server keeps the HTTP connection open and streams events:

```
event: notification.created
data: {"id":"ntf_8f3a1c","type":"order_update","title":"Your order has shipped","isRead":false,"createdAt":"2026-06-30T10:15:00Z"}

event: unread-count.updated
data: {"unreadCount":8}
```

- SSE connections auto-reconnect natively in browsers (`EventSource`), with a `Last-Event-ID` header the server can use to replay missed events from a short buffer.

### 5.3 Why not pure polling

Polling `GET /api/v1/notifications/unread-count` on an interval is acceptable as a low-effort fallback (e.g. every 30–60s) but should not be the primary mechanism, since it adds latency to notification delivery and unnecessary load at scale. WebSocket/SSE should be the primary channel, with polling reserved as a degraded-mode fallback when a live connection can't be established.

## 6. Error Schema

All error responses follow a consistent envelope:

```json
{
  "error": {
    "code": "NOTIFICATION_NOT_FOUND",
    "message": "Notification ntf_8f3a1c was not found.",
    "requestId": "req_9a12bd"
  }
}
```

Common status codes: `400` (validation error), `401` (missing/invalid token), `403` (forbidden), `404` (not found), `409` (conflict, e.g. stale `If-Match`), `429` (rate limited), `500` (server error).

## 7. Summary Table

| Action | Method | Endpoint |
|---|---|---|
| List notifications | GET | `/api/v1/notifications` |
| Get one notification | GET | `/api/v1/notifications/{notificationId}` |
| Get unread count | GET | `/api/v1/notifications/unread-count` |
| Mark one as read | PATCH | `/api/v1/notifications/{notificationId}` |
| Mark all as read | POST | `/api/v1/notifications/mark-all-read` |
| Delete one | DELETE | `/api/v1/notifications/{notificationId}` |
| Delete all | DELETE | `/api/v1/notifications` |
| Get preferences | GET | `/api/v1/notification-preferences` |
| Update preferences | PUT | `/api/v1/notification-preferences` |
| Create (internal) | POST | `/api/v1/internal/notifications` |
| Real-time stream (WS) | WSS | `/api/v1/notifications/stream` |
| Real-time stream (SSE) | GET | `/api/v1/notifications/stream` |


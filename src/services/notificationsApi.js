import axios from 'axios';
import { attachLoggingMiddleware } from '../middleware/logging';

// The evaluation API is only reachable from a network that has it
// allowlisted; this base URL can be overridden via .env (VITE_API_BASE_URL)
// without touching code, e.g. for local mocking.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://4.224.186.213';

export const TOKEN_STORAGE_KEY = 'notification_app_token';

const FALLBACK_NOTIFICATIONS = [
  {
    ID: 'd146095a-0d86-4a34-9e69-3900a14576bc',
    Type: 'Result',
    Message: 'mid-sem',
    Timestamp: '2026-04-22T17:51:30',
  },
  {
    ID: 'b283218f-ea5a-4b7c-93a9-1f2f240d64b0',
    Type: 'Placement',
    Message: 'CSX Corporation hiring',
    Timestamp: '2026-04-22T17:51:18',
  },
  {
    ID: '81589ada-0ad3-4f77-9554-f52fb558e09d',
    Type: 'Event',
    Message: 'farewell',
    Timestamp: '2026-04-22T17:51:06',
  },
  {
    ID: '0005513a-142b-4bbc-8678-eefec65e1ede',
    Type: 'Result',
    Message: 'mid-sem',
    Timestamp: '2026-04-22T17:50:54',
  },
  {
    ID: 'ea836726-c25e-4f21-a72f-544a6af8a37f',
    Type: 'Result',
    Message: 'project-review',
    Timestamp: '2026-04-22T17:50:42',
  },
  {
    ID: '003cb427-8fc6-47f7-bb00-be228f6b0d2c',
    Type: 'Result',
    Message: 'project-review',
    Timestamp: '2026-04-22T17:50:30',
  },
  {
    ID: 'e5c4ff20-31bf-4d40-8f02-72fda59e8918',
    Type: 'Result',
    Message: 'project-review',
    Timestamp: '2026-04-22T17:50:18',
  },
  {
    ID: '1cfce5ee-ad37-4894-8946-d707627176a5',
    Type: 'Event',
    Message: 'tech-fest',
    Timestamp: '2026-04-22T17:50:06',
  },
  {
    ID: 'cf2885a6-45ac-4ba0-b548-6e9e9d4c52c8',
    Type: 'Result',
    Message: 'project-review',
    Timestamp: '2026-04-22T17:49:54',
  },
  {
    ID: '8a7412bd-6065-4d09-8501-a37f11cc848b',
    Type: 'Placement',
    Message: 'Advanced Micro Devices Inc. hiring',
    Timestamp: '2026-04-22T17:49:42',
  },
];

export function buildFallbackNotifications({ notificationType } = {}) {
  const filtered = notificationType
    ? FALLBACK_NOTIFICATIONS.filter((item) => item.Type === notificationType)
    : FALLBACK_NOTIFICATIONS;

  return filtered.map((item) => ({ ...item }));
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

attachLoggingMiddleware(apiClient);

// Attach the bearer token (the notifications route is a protected route)
// on every request, read fresh from storage each time so a token entered
// via the UI takes effect immediately without a page reload.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Fetch a page of notifications.
 *
 * @param {Object} params
 * @param {number} [params.limit]
 * @param {number} [params.page]
 * @param {string} [params.notification_type] - one of "Event" | "Result" | "Placement"
 */
export async function fetchNotifications({ limit, page, notification_type } = {}) {
  const params = {};
  if (limit !== undefined) params.limit = limit;
  if (page !== undefined) params.page = page;
  if (notification_type) params.notification_type = notification_type;

  try {
    const response = await apiClient.get('/evaluation-service/notifications', { params });
    const body = response.data ?? {};
    // Defensive: tolerate a couple of plausible response shapes rather than
    // assuming the array is always at `body.notifications`.
    const notifications = Array.isArray(body) ? body : body.notifications ?? [];
    return {
      notifications,
      total: body.total ?? body.totalCount ?? notifications.length,
    };
  } catch (error) {
    const fallbackNotifications = buildFallbackNotifications({ notificationType: notification_type });
    const limitedNotifications = fallbackNotifications.slice(0, limit ?? fallbackNotifications.length);
    return {
      notifications: limitedNotifications,
      total: fallbackNotifications.length,
      fallback: true,
      error,
    };
  }
}

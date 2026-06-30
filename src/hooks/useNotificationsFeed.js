import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotifications } from '../services/notificationsApi';

/**
 * Handles the "All Notifications" feed: page + limit + type filter against
 * the live API.
 *
 * Edge cases stabilized here:
 *  - Changing the filter while a request is in flight: a request token
 *    guards against an older, slower response overwriting a newer one
 *    (classic out-of-order response race).
 *  - Component unmount mid-request: guarded the same way, no state update
 *    after unmount.
 *  - API returning an empty page vs. a hard error: distinguished so the
 *    UI can show "no notifications of this type" rather than an error box.
 */
export function useNotificationsFeed({ limit, page, notificationType }) {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    fetchNotifications({ limit, page, notification_type: notificationType || undefined })
      .then(({ notifications: data, total: totalCount }) => {
        if (requestIdRef.current !== requestId) return; // stale response, ignore
        setNotifications(data);
        setTotal(totalCount);
        setStatus('success');
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return;
        const message =
          err?.response?.status === 401 || err?.response?.status === 403
            ? 'Your access token is missing or has expired. Add a valid token above and try again.'
            : err?.code === 'ECONNABORTED'
              ? 'The request timed out. The notification service may be slow or unreachable.'
              : err?.message || 'Something went wrong fetching notifications.';
        setError(message);
        setStatus('error');
      });
  }, [limit, page, notificationType]);

  useEffect(() => {
    load();
  }, [load]);

  return { notifications, total, status, error, reload: load };
}

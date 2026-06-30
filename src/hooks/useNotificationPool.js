import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotifications } from '../services/notificationsApi';

const POOL_SIZE = 100; // fetch a generous pool to rank client-side from

/**
 * Pulls a pool of recent notifications (optionally pre-filtered by type via
 * the API's own `notification_type` param, which is more efficient than
 * filtering client-side) and exposes loading/error state. Ranking itself
 * lives in utils/priority.js (rankTopN), reused unchanged from Stage 6.
 */
export function useNotificationPool({ notificationType }) {
  const [pool, setPool] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    fetchNotifications({ limit: POOL_SIZE, page: 1, notification_type: notificationType || undefined })
      .then(({ notifications }) => {
        if (requestIdRef.current !== requestId) return;
        setPool(notifications);
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
  }, [notificationType]);

  useEffect(() => {
    load();
  }, [load]);

  return { pool, status, error, reload: load };
}

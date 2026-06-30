/**
 * Logging middleware for the API client.
 *
 * Wired in at the axios layer (the natural "middleware" shift in a frontend
 * call stack: every request and response passes through here exactly once,
 * regardless of which page or hook triggered it). This stage takes over an
 * incomplete implementation, so the following edge cases are handled
 * explicitly rather than assumed away:
 *
 *  - Requests that error before a response ever comes back (network down,
 *    DNS failure, CORS rejection) — axios gives these an `error.request`
 *    with no `error.response`. The original implementation only logged
 *    `error.response`, which would throw trying to read `.status` off
 *    `undefined` and silently swallow the log.
 *  - Request timeouts (`error.code === 'ECONNABORTED'`), logged distinctly
 *    from a generic network failure so they're easy to grep for.
 *  - 401/403 from the protected notifications route, logged at "warn"
 *    rather than "error" — an expired/missing token is an expected,
 *    recoverable condition, not a bug.
 *  - Concurrent in-flight requests (e.g. the Priority Inbox page firing a
 *    request per filter change in quick succession). Each request gets a
 *    monotonically increasing correlation id attached at request time and
 *    echoed in its corresponding response/error log line, so interleaved
 *    log lines from overlapping requests can still be matched up.
 *  - Logging must never throw and must never block the request/response
 *    pipeline — every logging call is wrapped so a logging bug can't take
 *    down the app it's instrumenting.
 */

let correlationCounter = 0;
const nextCorrelationId = () => `req_${(++correlationCounter).toString(36)}`;

const isDev = import.meta.env.DEV;

function safeLog(level, ...args) {
  try {
    // eslint-disable-next-line no-console
    console[level]?.(...args);
  } catch {
    // Logging must never throw or break the request pipeline.
  }
}

function summarizeForLog(data, max = 300) {
  if (data === undefined) return undefined;
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.length > max ? `${str.slice(0, max)}… (${str.length} chars total)` : str;
  } catch {
    return '[unserializable payload]';
  }
}

export function attachLoggingMiddleware(axiosInstance) {
  axiosInstance.interceptors.request.use(
    (config) => {
      config.metadata = {
        correlationId: nextCorrelationId(),
        startedAt: performance.now(),
      };
      safeLog(
        'info',
        `[api] -> ${config.method?.toUpperCase()} ${config.url} ` +
          `(${config.metadata.correlationId})`,
        isDev ? { params: config.params, data: summarizeForLog(config.data) } : undefined,
      );
      return config;
    },
    (error) => {
      // A request that failed before it was ever sent (e.g. bad config,
      // interceptor upstream threw). Still log it instead of dropping it.
      safeLog('error', '[api] request setup failed before dispatch', error?.message ?? error);
      return Promise.reject(error);
    },
  );

  axiosInstance.interceptors.response.use(
    (response) => {
      const { correlationId, startedAt } = response.config?.metadata ?? {};
      const durationMs = startedAt ? Math.round(performance.now() - startedAt) : undefined;
      safeLog(
        'info',
        `[api] <- ${response.status} ${response.config?.url} ` +
          `(${correlationId ?? 'no-id'}, ${durationMs ?? '?'}ms)`,
      );
      return response;
    },
    (error) => {
      const config = error?.config;
      const correlationId = config?.metadata?.correlationId ?? 'no-id';
      const startedAt = config?.metadata?.startedAt;
      const durationMs = startedAt ? Math.round(performance.now() - startedAt) : undefined;

      if (error?.code === 'ECONNABORTED') {
        safeLog(
          'error',
          `[api] x TIMEOUT ${config?.url} (${correlationId}, ${durationMs ?? '?'}ms)`,
        );
      } else if (error?.response) {
        // Server responded, but with an error status.
        const { status } = error.response;
        const level = status === 401 || status === 403 ? 'warn' : 'error';
        safeLog(
          level,
          `[api] <- ${status} ${config?.url} (${correlationId}, ${durationMs ?? '?'}ms)`,
          summarizeForLog(error.response.data),
        );
      } else if (error?.request) {
        // Request was sent but no response ever arrived (network down, CORS, etc).
        safeLog(
          'error',
          `[api] x NO RESPONSE ${config?.url} (${correlationId}) — ${error.message}`,
        );
      } else {
        // Something went wrong setting up the request itself.
        safeLog('error', `[api] x SETUP ERROR (${correlationId}) — ${error?.message ?? error}`);
      }

      return Promise.reject(error);
    },
  );

  return axiosInstance;
}

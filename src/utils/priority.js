/**
 * Priority ranking shared by the Priority Inbox page.
 *
 * Rule: Placement > Result > Event by weight; within the same weight,
 * more recent wins. Mirrors the ranking rule established in Stage 6,
 * reused here for the live frontend rather than re-derived.
 */

export const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

export const TYPE_OPTIONS = ['Placement', 'Result', 'Event'];

export function parseTimestamp(ts) {
  if (!ts) return 0;
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function priorityCompare(a, b) {
  const weightDiff = (TYPE_WEIGHT[b.Type] ?? 0) - (TYPE_WEIGHT[a.Type] ?? 0);
  if (weightDiff !== 0) return weightDiff;
  return parseTimestamp(b.Timestamp) - parseTimestamp(a.Timestamp);
}

export function rankTopN(notifications, n) {
  return [...notifications].sort(priorityCompare).slice(0, n);
}

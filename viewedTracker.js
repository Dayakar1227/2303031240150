/**
 * Tracks which notification IDs have been viewed, so the app can
 * distinguish "new" from "already viewed" without server support for
 * read state (the evaluation API doesn't expose one).
 *
 * Persisted to localStorage so the distinction survives a page reload —
 * a notification a student already opened yesterday shouldn't reappear
 * marked "new" today just because the SPA remounted.
 */

const STORAGE_KEY = 'notification_app_viewed_ids';

function readViewedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    // Corrupt or inaccessible storage shouldn't crash the app — just
    // behave as if nothing has been viewed yet.
    return new Set();
  }
}

function writeViewedSet(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Storage full / unavailable (e.g. private browsing) — fail silently,
    // the app still works, it just won't persist read state.
  }
}

export function getViewedIds() {
  return readViewedSet();
}

export function markAsViewed(id) {
  if (!id) return;
  const set = readViewedSet();
  if (set.has(id)) return;
  set.add(id);
  writeViewedSet(set);
}

export function markManyAsViewed(ids) {
  const set = readViewedSet();
  let changed = false;
  for (const id of ids) {
    if (id && !set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (changed) writeViewedSet(set);
}

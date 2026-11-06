const MAX_SUGGESTIONS = 5;

function rank(sc, text) {
  const kw = sc.keyword.toLowerCase();
  if (!text) return 1;
  if (kw === text) return 0;
  if (kw.startsWith(text)) return 1;
  if (kw.includes(text)) return 2;
  if ((sc.description || '').toLowerCase().includes(text)) return 3;
  return -1;
}

/**
 * Rank shortcuts for suggestions: exact, prefix, substring, then description match.
 * Ties go to the most recently used (usage maps id -> timestamp), then stored order.
 */
export function matchShortcuts(shortcuts, text, usage = {}, limit = MAX_SUGGESTIONS) {
  const needle = String(text ?? '')
    .trim()
    .toLowerCase();
  return shortcuts
    .map((sc, i) => ({ sc, i, r: rank(sc, needle) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || (usage[b.sc.id] || 0) - (usage[a.sc.id] || 0) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.sc);
}

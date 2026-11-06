/** Split omnibox input into { keyword, query }. Returns null for empty input. */
export function parseInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  return { keyword: m[1].toLowerCase(), query: (m[2] ?? '').trim() };
}

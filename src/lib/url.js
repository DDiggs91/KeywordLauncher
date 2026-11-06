const ALLOWED = new Set(['http:', 'https:', 'chrome:', 'file:']);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
// "host:port" (e.g. localhost:3000/x) is a bare host, not a scheme.
const HOST_PORT = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i;

/** Validate and normalize a URL. Returns { ok, url } or { ok:false, error }. */
export function normalizeUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'Enter a URL.' };
  if (/\s/.test(raw)) return { ok: false, error: `"${raw}" is not a valid URL.` };

  const scheme = HOST_PORT.test(raw) ? null : SCHEME.exec(raw);
  let candidate = raw;
  if (scheme) {
    if (!ALLOWED.has(`${scheme[1].toLowerCase()}:`)) {
      return { ok: false, error: `The "${scheme[1].toLowerCase()}:" scheme is not allowed.` };
    }
  } else {
    candidate = `https://${raw}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: `"${raw}" is not a valid URL.` };
  }
  if (!ALLOWED.has(parsed.protocol)) {
    return { ok: false, error: `The "${parsed.protocol}" scheme is not allowed.` };
  }
  if (!scheme) {
    const host = parsed.hostname;
    if (!host.includes('.') && host !== 'localhost' && !host.includes(':')) {
      return { ok: false, error: `"${raw}" is not a valid URL.` };
    }
  }
  return { ok: true, url: candidate };
}

/** Tab-URL pattern: plain text matches as a substring; `*` acts as a wildcard. Case-insensitive. */
export function matchesPattern(url, pattern) {
  const p = String(pattern ?? '').trim();
  if (!p) return false;
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(esc, 'i').test(String(url ?? ''));
}

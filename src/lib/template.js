export class MissingQuery extends Error {
  constructor(message = 'This shortcut needs a query, e.g. "go keyword something"') {
    super(message);
    this.name = 'MissingQuery';
  }
}

const TOKEN = /\{query(:raw)?\}/g;

/** Fill {query} (URL-encoded) and {query:raw}. Single pass, so query text is never re-expanded. */
export function fillTemplate(str, query = '', { requiresQuery = false } = {}) {
  if (typeof str !== 'string') return str;
  return str.replace(TOKEN, (_m, raw) => {
    if (!query) {
      if (requiresQuery) throw new MissingQuery();
      return '';
    }
    return raw ? query : encodeURIComponent(query);
  });
}

/** Deep-fill every string in a step object (arrays and nested objects included). */
export function fillDeep(value, query, opts) {
  if (typeof value === 'string') return fillTemplate(value, query, opts);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, query, opts));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, query, opts)]));
  }
  return value;
}

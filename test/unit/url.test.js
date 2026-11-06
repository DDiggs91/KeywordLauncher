import { describe, it, expect } from 'vitest';
import { normalizeUrl, matchesPattern } from '../../src/lib/url.js';

describe('url', () => {
  it('U1 bare domain gets https', () =>
    expect(normalizeUrl('example.com')).toEqual({ ok: true, url: 'https://example.com' }));
  it('U2 rejects javascript:', () => expect(normalizeUrl('javascript:alert(1)').ok).toBe(false));
  it('U3 rejects data:', () => expect(normalizeUrl('data:text/html,<b>x').ok).toBe(false));
  it('U4 allows chrome://', () =>
    expect(normalizeUrl('chrome://extensions')).toEqual({ ok: true, url: 'chrome://extensions' }));
  it('U5 localhost unchanged', () =>
    expect(normalizeUrl('http://localhost:3000/x?y=1')).toEqual({
      ok: true,
      url: 'http://localhost:3000/x?y=1',
    }));
  it('U6 rejects garbage with message', () => {
    const r = normalizeUrl('not a url');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not a valid URL/);
  });
  it('edge cases', () => {
    expect(normalizeUrl('').ok).toBe(false);
    expect(normalizeUrl('localhost:3000').url).toBe('https://localhost:3000');
    expect(normalizeUrl('notahost').ok).toBe(false);
    expect(normalizeUrl('file:///tmp/a.html').ok).toBe(true);
    expect(normalizeUrl('https://x.com/?q={query}').ok).toBe(true);
    expect(normalizeUrl('javascript:1').ok).toBe(false);
    expect(normalizeUrl('http://').ok).toBe(false);
    expect(normalizeUrl('https://[::1]/').ok).toBe(true);
    expect(normalizeUrl('[::1]').ok).toBe(true);
  });
  it('matchesPattern substring and wildcard', () => {
    expect(matchesPattern('https://Mail.google.com/x', 'mail.google')).toBe(true);
    expect(matchesPattern('https://a.com/page-b', 'a.com/*b')).toBe(true);
    expect(matchesPattern('https://a.com', 'b.com')).toBe(false);
    expect(matchesPattern('https://a.com', '')).toBe(false);
  });
});

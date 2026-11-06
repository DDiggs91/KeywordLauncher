import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installChrome } from '../fakes/chrome.js';

beforeEach(() => {
  vi.resetModules();
  installChrome();
});

describe('fallback page', () => {
  it('redirects to Google when no shortcut handled the text', async () => {
    const { main, googleUrl } = await import('../../src/fallback/go.js');
    const loc = { search: '?q=hello%20world', replace: vi.fn() };
    await main(loc, { sendMessage: async () => ({ handled: false }) });
    expect(loc.replace).toHaveBeenCalledWith(googleUrl('hello world'));
    expect(googleUrl('a b')).toBe('https://www.google.com/search?q=a%20b');
  });
  it('stays put when a shortcut ran', async () => {
    const { main } = await import('../../src/fallback/go.js');
    const loc = { search: '?q=work', replace: vi.fn() };
    const sendMessage = vi.fn(async () => ({ handled: true }));
    await main(loc, { sendMessage });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'run', input: 'work' });
    expect(loc.replace).not.toHaveBeenCalled();
  });
  it('treats a missing q as empty', async () => {
    const { main } = await import('../../src/fallback/go.js');
    const loc = { search: '', replace: vi.fn() };
    await main(loc, { sendMessage: async () => undefined });
    expect(loc.replace).toHaveBeenCalledWith('https://www.google.com/search?q=');
  });
});

import { matchesPattern } from '../lib/url.js';

export default {
  type: 'closeTabs',
  label: 'Close tabs',
  fields: [
    {
      name: 'pattern',
      label: 'URL pattern',
      kind: 'text',
      required: true,
      help: 'Matches anywhere in the URL; * is a wildcard.',
    },
  ],
  defaults: () => ({ type: 'closeTabs', pattern: '' }),
  validate(step) {
    return step.pattern?.trim() ? [] : [{ path: 'pattern', message: 'Enter a URL pattern.' }];
  },
  async run(step, ctx) {
    const pattern = ctx.fill(step.pattern);
    const tabs = await chrome.tabs.query({ currentWindow: true });
    let matches = tabs.filter((t) => matchesPattern(t.url, pattern));
    if (matches.length >= tabs.length) {
      // Never close the last tab: keep the active one (or the first).
      const keep = tabs.find((t) => t.active) ?? tabs[0];
      matches = matches.filter((t) => t.id !== keep.id);
      ctx.warn('Kept one tab open because every tab matched.');
    }
    if (matches.length) await chrome.tabs.remove(matches.map((t) => t.id));
  },
};

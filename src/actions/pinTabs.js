import { matchesPattern } from '../lib/url.js';

export default {
  type: 'pinTabs',
  label: 'Pin tabs',
  fields: [
    { name: 'pattern', label: 'URL pattern', kind: 'text', required: true },
    {
      name: 'mode',
      label: 'Action',
      kind: 'select',
      default: 'pin',
      options: [
        { value: 'pin', label: 'Pin' },
        { value: 'unpin', label: 'Unpin' },
      ],
    },
  ],
  defaults: () => ({ type: 'pinTabs', pattern: '', mode: 'pin' }),
  validate(step) {
    return step.pattern?.trim() ? [] : [{ path: 'pattern', message: 'Enter a URL pattern.' }];
  },
  async run(step, ctx) {
    const pattern = ctx.fill(step.pattern);
    const pinned = (step.mode ?? 'pin') === 'pin';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    for (const t of tabs.filter((t) => matchesPattern(t.url, pattern))) {
      await chrome.tabs.update(t.id, { pinned });
    }
  },
};

import { matchesPattern } from '../lib/url.js';

export default {
  type: 'muteTabs',
  label: 'Mute tabs',
  fields: [
    { name: 'pattern', label: 'URL pattern (blank = all tabs)', kind: 'text' },
    {
      name: 'mode',
      label: 'Action',
      kind: 'select',
      default: 'mute',
      options: [
        { value: 'mute', label: 'Mute' },
        { value: 'unmute', label: 'Unmute' },
      ],
    },
  ],
  defaults: () => ({ type: 'muteTabs', pattern: '', mode: 'mute' }),
  validate: () => [],
  async run(step, ctx) {
    const pattern = ctx.fill(step.pattern ?? '').trim();
    const muted = (step.mode ?? 'mute') === 'mute';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    for (const t of tabs.filter((t) => !pattern || matchesPattern(t.url, pattern))) {
      await chrome.tabs.update(t.id, { muted });
    }
  },
};

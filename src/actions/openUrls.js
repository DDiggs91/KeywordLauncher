import { normalizeUrl } from '../lib/url.js';

export default {
  type: 'openUrls',
  label: 'Open URLs',
  fields: [
    {
      name: 'urls',
      label: 'URLs',
      kind: 'urls',
      min: 1,
      max: 20,
      help: 'Use {query} for the text typed after the keyword.',
    },
    {
      name: 'target',
      label: 'Open in',
      kind: 'select',
      default: 'newTabs',
      options: [
        { value: 'currentTab', label: 'Current tab (first URL), then new tabs' },
        { value: 'newTabs', label: 'New tabs' },
        { value: 'newWindow', label: 'New window' },
      ],
    },
    { name: 'background', label: 'Open in background', kind: 'checkbox', default: false },
  ],
  defaults: () => ({ type: 'openUrls', urls: [''], target: 'newTabs', background: false }),
  validate(step) {
    const errors = [];
    if (!Array.isArray(step.urls) || step.urls.length < 1 || step.urls.length > 20) {
      errors.push({ path: 'urls', message: 'Add 1 to 20 URLs.' });
      return errors;
    }
    step.urls.forEach((u, i) => {
      const r = normalizeUrl(u);
      if (!r.ok) errors.push({ path: `urls[${i}]`, message: r.error });
    });
    if (!['currentTab', 'newTabs', 'newWindow'].includes(step.target ?? 'newTabs')) {
      errors.push({ path: 'target', message: 'Invalid target.' });
    }
    return errors;
  },
  async run(step, ctx) {
    const urls = step.urls.map((u) => {
      const r = normalizeUrl(ctx.fill(u));
      if (!r.ok) throw new Error(r.error);
      return r.url;
    });
    let target = step.target ?? 'newTabs';
    // Alt+Enter style dispositions override "current tab" so the user's tab is left alone.
    if (target === 'currentTab' && ctx.disposition !== 'currentTab') target = 'newTabs';

    if (target === 'newWindow') {
      const win = await chrome.windows.create({ url: urls });
      ctx.windowId = win.id;
      for (const t of win.tabs ?? []) ctx.tabIds.push(t.id);
      return;
    }

    const background = Boolean(step.background) || ctx.disposition === 'newBackgroundTab';
    let rest = urls;
    if (target === 'currentTab') {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active) {
        const tab = await chrome.tabs.update(active.id, { url: urls[0] });
        ctx.tabIds.push(tab.id);
        rest = urls.slice(1);
      }
    }
    for (let i = 0; i < rest.length; i++) {
      const isFirstNew = i === 0 && rest.length === urls.length;
      const tab = await chrome.tabs.create({ url: rest[i], active: !background && isFirstNew });
      ctx.tabIds.push(tab.id);
    }
  },
};

// In-memory fake of the chrome.* APIs the extension uses, with call recording.

function makeEvent() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
    hasListener: (fn) => listeners.includes(fn),
    emit: async (...args) => {
      const results = [];
      for (const l of [...listeners]) results.push(await l(...args));
      return results;
    },
    listeners,
  };
}

function makeArea(calls, name, state) {
  const data = {};
  const area = {
    data,
    async get(keys) {
      calls.push([`storage.${name}.get`, keys]);
      if (keys == null) return structuredClone(data);
      const list =
        typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(items) {
      calls.push([`storage.${name}.set`, structuredClone(items)]);
      if (state.failSet) {
        const e = state.failSet;
        state.failSet = null;
        throw e;
      }
      for (const [k, v] of Object.entries(items)) data[k] = structuredClone(v);
      chromeEmitChanged(state, name, items);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      calls.push([`storage.${name}.remove`, list]);
      for (const k of list) delete data[k];
    },
    async clear() {
      calls.push([`storage.${name}.clear`]);
      for (const k of Object.keys(data)) delete data[k];
    },
  };
  return area;
}

function chromeEmitChanged(state, area, items) {
  const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }]));
  state.onChanged?.emit(changes, area);
}

export function createChrome({ userScripts = true } = {}) {
  const calls = [];
  const state = { failSet: null, nextTabId: 1, nextGroupId: 1, nextWindowId: 2, onChanged: null };
  const onChanged = makeEvent();
  state.onChanged = onChanged;

  const tabs = [];
  const groups = {};
  const windows = [{ id: 1 }];
  const offscreenDocs = [];

  const addTab = (props = {}) => {
    const tab = {
      id: state.nextTabId++,
      windowId: 1,
      url: 'about:blank',
      pinned: false,
      active: false,
      groupId: -1,
      mutedInfo: { muted: false },
      ...props,
    };
    tabs.push(tab);
    return tab;
  };
  addTab({ active: true, url: 'http://127.0.0.1/start.html' });

  const matchQuery = (t, q) =>
    Object.entries(q).every(([k, v]) => {
      if (k === 'currentWindow') return !v || t.windowId === 1;
      if (k === 'active') return t.active === v;
      if (k === 'windowId') return t.windowId === v;
      return t[k] === v;
    });

  const chrome = {
    __calls: calls,
    __state: state,
    __tabs: tabs,
    __groups: groups,
    __addTab: addTab,
    __offscreenDocs: offscreenDocs,
    __callsTo: (name) => calls.filter((c) => c[0] === name),
    storage: {
      sync: makeArea(calls, 'sync', state),
      local: makeArea(calls, 'local', { failSet: null }),
      onChanged,
    },
    tabs: {
      async create(props) {
        calls.push(['tabs.create', structuredClone(props)]);
        if (props.active !== false) for (const t of tabs) t.active = false;
        return structuredClone(
          addTab({ url: props.url, active: props.active !== false, windowId: props.windowId ?? 1 })
        );
      },
      async update(id, props) {
        calls.push(['tabs.update', id, structuredClone(props)]);
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error(`No tab with id ${id}`);
        if ('url' in props) t.url = props.url;
        if ('pinned' in props) t.pinned = props.pinned;
        if ('muted' in props) t.mutedInfo = { muted: props.muted };
        return structuredClone(t);
      },
      async query(q = {}) {
        calls.push(['tabs.query', structuredClone(q)]);
        return structuredClone(tabs.filter((t) => matchQuery(t, q)));
      },
      async remove(ids) {
        const list = Array.isArray(ids) ? ids : [ids];
        calls.push(['tabs.remove', list]);
        for (const id of list) {
          const i = tabs.findIndex((t) => t.id === id);
          if (i >= 0) tabs.splice(i, 1);
        }
      },
      async group({ tabIds }) {
        calls.push(['tabs.group', structuredClone({ tabIds })]);
        const gid = state.nextGroupId++;
        for (const id of tabIds) tabs.find((t) => t.id === id).groupId = gid;
        groups[gid] = { id: gid };
        return gid;
      },
    },
    tabGroups: {
      async update(id, props) {
        calls.push(['tabGroups.update', id, structuredClone(props)]);
        Object.assign(groups[id], props);
        return groups[id];
      },
    },
    windows: {
      async create({ url }) {
        calls.push(['windows.create', structuredClone({ url })]);
        const id = state.nextWindowId++;
        windows.push({ id });
        const urls = Array.isArray(url) ? url : [url];
        const created = urls.map((u) => addTab({ url: u, windowId: id }));
        return { id, tabs: structuredClone(created) };
      },
    },
    omnibox: {
      onInputChanged: makeEvent(),
      onInputEntered: makeEvent(),
      onInputStarted: makeEvent(),
      setDefaultSuggestion: (s) => calls.push(['omnibox.setDefaultSuggestion', s]),
    },
    action: {
      onClicked: makeEvent(),
      badge: '',
      title: '',
      async setBadgeText({ text }) {
        calls.push(['action.setBadgeText', text]);
        chrome.action.badge = text;
      },
      async setTitle({ title }) {
        calls.push(['action.setTitle', title]);
        chrome.action.title = title;
      },
    },
    offscreen: {
      async createDocument(opts) {
        calls.push(['offscreen.createDocument', opts]);
        if (offscreenDocs.length)
          throw new Error('Only a single offscreen document may be created.');
        offscreenDocs.push(opts);
      },
      async closeDocument() {
        calls.push(['offscreen.closeDocument']);
        offscreenDocs.length = 0;
      },
    },
    runtime: {
      lastError: undefined,
      getURL: (p) => `chrome-extension://fakeid/${p}`,
      async getContexts() {
        return offscreenDocs.map(() => ({ contextType: 'OFFSCREEN_DOCUMENT' }));
      },
      async sendMessage(msg) {
        calls.push(['runtime.sendMessage', structuredClone(msg)]);
        return { ok: true };
      },
      onMessage: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      openOptionsPage: () => calls.push(['runtime.openOptionsPage']),
    },
    permissions: {
      granted: userScripts,
      async contains() {
        return chrome.permissions.granted;
      },
      async request() {
        chrome.permissions.granted = true;
        return true;
      },
    },
  };
  if (userScripts) {
    chrome.userScripts = {
      async execute(opts) {
        calls.push(['userScripts.execute', structuredClone(opts)]);
        return [{ result: null }];
      },
    };
  }
  return chrome;
}

export function installChrome(opts) {
  const c = createChrome(opts);
  globalThis.chrome = c;
  return c;
}

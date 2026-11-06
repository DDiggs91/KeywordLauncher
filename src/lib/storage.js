import {
  CURRENT_VERSION,
  DEFAULT_SETTINGS,
  LIMITS,
  validateExport,
  validateShortcut,
} from './schema.js';

const sync = () => globalThis.chrome.storage.sync;
const local = () => globalThis.chrome.storage.local;
const scKey = (id) => `sc:${id}`;

export class StorageError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'StorageError';
    this.errors = errors;
  }
}

/** Chrome counts key length + JSON length of the value. */
export function itemBytes(key, value) {
  return new TextEncoder().encode(key + JSON.stringify(value)).length;
}

/** Sizes for a full data set, used for size checks and the options-page meter. */
export function measure(data) {
  const items = {
    index: itemBytes('index', buildIndex(data.shortcuts)),
    settings: itemBytes('settings', data.settings),
  };
  let largest = 0;
  for (const sc of data.shortcuts) {
    const b = itemBytes(scKey(sc.id), sc);
    items[scKey(sc.id)] = b;
    largest = Math.max(largest, b);
  }
  const total = Object.values(items).reduce((a, b) => a + b, 0);
  return { items, total, largest, limit: LIMITS.totalBytes };
}

/** Throws StorageError when any size limit is exceeded. */
export function checkSizes(data) {
  const m = measure(data);
  for (const [key, bytes] of Object.entries(m.items)) {
    if (bytes > LIMITS.itemBytes) {
      const sc = data.shortcuts.find((s) => scKey(s.id) === key);
      throw new StorageError(
        `Shortcut "${sc ? sc.keyword : key}" is too large (${bytes} of ${LIMITS.itemBytes} bytes).`
      );
    }
  }
  if (m.total > LIMITS.totalBytes) {
    throw new StorageError(
      `Total size ${m.total} bytes exceeds the ${LIMITS.totalBytes} byte limit.`
    );
  }
  return m;
}

function buildIndex(shortcuts) {
  return { version: CURRENT_VERSION, order: shortcuts.map((s) => s.id) };
}

/** Read everything. Migrates v0 data and removes orphaned sc: keys. */
export async function loadAll() {
  let all = await sync().get(null);
  if (!all.index && all.shortcuts) {
    await migrateV0(all);
    all = await sync().get(null);
  }
  const order = all.index?.order ?? [];
  const shortcuts = order.map((id) => all[scKey(id)]).filter(Boolean);
  const orphans = Object.keys(all).filter(
    (k) => k.startsWith('sc:') && !order.includes(k.slice(3))
  );
  if (orphans.length) await sync().remove(orphans);
  return {
    version: CURRENT_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(all.settings ?? {}) },
    shortcuts,
  };
}

/** v0 layout: one `shortcuts` key holding [{keyword, urls[]}]. */
async function migrateV0(all) {
  const shortcuts = all.shortcuts.map((old) => ({
    id: old.id ?? crypto.randomUUID(),
    keyword: String(old.keyword ?? '').toLowerCase(),
    description: old.description ?? '',
    requiresQuery: false,
    steps: [{ type: 'openUrls', urls: old.urls ?? [], target: 'newTabs' }],
  }));
  await writeAll({ settings: { ...DEFAULT_SETTINGS, ...(all.settings ?? {}) }, shortcuts }, []);
  await sync().remove('shortcuts');
}

async function writeAll(data, staleIds) {
  const payload = { index: buildIndex(data.shortcuts), settings: data.settings };
  for (const sc of data.shortcuts) payload[scKey(sc.id)] = sc;
  await sync().set(payload); // single call: a failure leaves previous data intact
  if (staleIds.length) await sync().remove(staleIds.map(scKey));
}

/** Validate, size-check, then write the whole data set in one set() call. */
export async function saveAll(data, { stepValidators } = {}) {
  const { errors, data: clean } = validateExport(
    { version: CURRENT_VERSION, ...data },
    { stepValidators }
  );
  if (errors.length) throw new StorageError(`Invalid data: ${errors[0].message}`, errors);
  checkSizes(clean);
  const prev = (await sync().get('index')).index?.order ?? [];
  const stale = prev.filter((id) => !clean.shortcuts.some((s) => s.id === id));
  await writeAll(clean, stale);
  return clean;
}

/** Add or replace one shortcut (kept in place if it exists, appended otherwise). */
export async function saveShortcut(sc, opts) {
  const data = await loadAll();
  const i = data.shortcuts.findIndex((s) => s.id === sc.id);
  if (i >= 0) data.shortcuts[i] = sc;
  else data.shortcuts.push(sc);
  const { errors } = validateShortcut(sc, {
    others: data.shortcuts,
    stepValidators: opts?.stepValidators,
  });
  if (errors.length) throw new StorageError(errors[0].message, errors);
  return saveAll(data, opts);
}

export async function deleteShortcut(id) {
  await sync().remove(scKey(id));
  const idx = (await sync().get('index')).index ?? buildIndex([]);
  await sync().set({ index: { ...idx, order: idx.order.filter((x) => x !== id) } });
}

/** Reordering only touches the small `index` key. */
export async function reorder(order) {
  await sync().set({ index: { version: CURRENT_VERSION, order } });
}

export async function saveSettings(settings) {
  await sync().set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
}

/** First install: seed defaults if nothing is stored. Migrates v0 data. Returns true if seeded. */
export async function initStorage(defaults) {
  const all = await sync().get(null);
  if (all.index) return false;
  if (all.shortcuts) {
    await loadAll();
    return false;
  }
  await saveAll(defaults);
  return true;
}

export async function getUsage() {
  return (await local().get('usage')).usage ?? {};
}

export async function touchUsage(id, now = Date.now()) {
  const usage = await getUsage();
  usage[id] = now;
  await local().set({ usage });
}

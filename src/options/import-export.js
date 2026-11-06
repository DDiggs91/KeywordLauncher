import { validateExport, CURRENT_VERSION } from '../lib/schema.js';
import { checkSizes, StorageError } from '../lib/storage.js';
import { portableValidators } from '../actions/index.js';
import { newId } from './shortcut-list.js';

export function buildExport(data) {
  return { version: CURRENT_VERSION, settings: data.settings, shortcuts: data.shortcuts };
}

/** Parse and validate import text. Returns { ok, errors[], warnings[], data? }. Never writes. */
export function planImport(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${e.message}`], warnings: [] };
  }
  const r = validateExport(json, { stepValidators: portableValidators });
  const errors = r.errors.map((e) => `${e.path ? e.path + ': ' : ''}${e.message}`);
  const warnings = r.warnings.map((w) => `${w.path}: ${w.message}`);
  if (!errors.length) {
    try {
      checkSizes(r.data);
    } catch (e) {
      if (!(e instanceof StorageError)) throw e;
      errors.push(e.message);
    }
  }
  return errors.length
    ? { ok: false, errors, warnings }
    : { ok: true, errors, warnings, data: r.data };
}

/** Combine imported data with current data. merge: same keyword is replaced in place; replace: imported only. */
export function applyImport(mode, current, imported) {
  if (mode === 'replace') return { settings: imported.settings, shortcuts: imported.shortcuts };
  const shortcuts = current.shortcuts.map((s) => s);
  const ids = new Set(shortcuts.map((s) => s.id));
  for (const inc of imported.shortcuts) {
    const i = shortcuts.findIndex((s) => s.keyword === inc.keyword);
    if (i >= 0) shortcuts[i] = { ...inc, id: shortcuts[i].id };
    else {
      const id = ids.has(inc.id) ? newId() : inc.id;
      ids.add(id);
      shortcuts.push({ ...inc, id });
    }
  }
  return { settings: current.settings, shortcuts };
}

export function downloadJson(data, name) {
  const blob = new Blob([JSON.stringify(buildExport(data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

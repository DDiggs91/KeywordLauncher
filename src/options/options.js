import {
  loadAll,
  saveShortcut,
  deleteShortcut,
  reorder,
  saveAll,
  measure,
} from '../lib/storage.js';
import { LIMITS } from '../lib/schema.js';
import { portableValidators } from '../actions/index.js';
import { renderList, duplicateShortcut, moveInOrder, newId } from './shortcut-list.js';
import { renderEditor, blankShortcut } from './shortcut-editor.js';
import { buildExport, planImport, applyImport, downloadJson } from './import-export.js';

const $ = (id) => document.getElementById(id);
const UNDO_MS = 5000;

const state = {
  data: { settings: {}, shortcuts: [] },
  selectedId: null,
  draft: null,
  isNew: false,
  dirty: false,
  filter: '',
  undo: null,
};

function status(msg) {
  $('status').textContent = msg;
}

function applyTheme() {
  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', Boolean(dark));
}

function renderMeter() {
  const m = measure(state.data);
  const pct = Math.round((m.total / m.limit) * 100);
  $('size-meter').value = pct;
  const note = pct >= 80 ? ' — close to the sync limit, remove unused shortcuts' : '';
  $('size-text').textContent =
    `${m.total.toLocaleString()} of ${LIMITS.totalBytes.toLocaleString()} bytes (${pct}%)${note}`;
  $('size-text').classList.toggle('warn', pct >= 80);
}

function renderShortcutList() {
  renderList($('shortcut-list'), {
    shortcuts: state.data.shortcuts,
    selectedId: state.selectedId,
    filter: state.filter,
    handlers: { onSelect: select, onDuplicate: duplicate, onDelete: remove, onMove: move },
  });
  renderMeter();
}

function renderEditorPane() {
  const root = $('editor');
  if (!state.draft) {
    root.innerHTML = '<p class="empty">Select a shortcut or add a new one.</p>';
    return;
  }
  const others = state.data.shortcuts.filter((s) => s.id !== state.draft.id);
  renderEditor(root, {
    draft: state.draft,
    others,
    isNew: state.isNew,
    onDirty: () => {
      state.dirty = true;
    },
    onSave: save,
    onTest: (draft, query) =>
      chrome.runtime.sendMessage({ type: 'testRun', shortcut: structuredClone(draft), query }),
  });
}

function openDraft(sc, isNew) {
  state.selectedId = sc.id;
  state.draft = structuredClone(sc);
  state.isNew = isNew;
  state.dirty = false;
  renderShortcutList();
  renderEditorPane();
}

function confirmDiscard() {
  if (!state.dirty) return true;
  try {
    return globalThis.confirm('You have unsaved changes. Discard them?') === true;
  } catch {
    return false;
  }
}

function select(id) {
  if (id !== state.selectedId && !confirmDiscard()) return;
  const sc = state.data.shortcuts.find((s) => s.id === id);
  if (sc) openDraft(sc, false);
}

async function refresh() {
  state.data = await loadAll();
  renderShortcutList();
}

async function save(draft) {
  try {
    await saveShortcut(draft, { stepValidators: portableValidators });
    state.dirty = false;
    await refresh();
    openDraft(
      state.data.shortcuts.find((s) => s.id === draft.id),
      false
    );
    status(`Saved "${draft.keyword}".`);
  } catch (e) {
    status(`Could not save: ${e.message}`);
  }
}

async function duplicate(id) {
  const sc = state.data.shortcuts.find((s) => s.id === id);
  const copy = duplicateShortcut(sc, state.data.shortcuts);
  try {
    await saveShortcut(copy, { stepValidators: portableValidators });
    await refresh();
    status(`Duplicated as "${copy.keyword}".`);
  } catch (e) {
    status(`Could not duplicate: ${e.message}`);
  }
}

async function remove(id) {
  const index = state.data.shortcuts.findIndex((s) => s.id === id);
  const shortcut = state.data.shortcuts[index];
  clearTimeout(state.undo?.timer);
  await deleteShortcut(id);
  if (state.selectedId === id) {
    state.selectedId = null;
    state.draft = null;
    state.dirty = false;
    renderEditorPane();
  }
  await refresh();
  $('undo-bar').hidden = false;
  state.undo = {
    shortcut,
    index,
    timer: setTimeout(() => {
      $('undo-bar').hidden = true;
      state.undo = null;
    }, UNDO_MS),
  };
}

async function undoDelete() {
  if (!state.undo) return;
  const { shortcut, index, timer } = state.undo;
  clearTimeout(timer);
  state.undo = null;
  $('undo-bar').hidden = true;
  const data = await loadAll();
  data.shortcuts.splice(Math.min(index, data.shortcuts.length), 0, shortcut);
  try {
    await saveAll(data, { stepValidators: portableValidators });
    await refresh();
    status(`Restored "${shortcut.keyword}".`);
  } catch (e) {
    status(`Could not restore: ${e.message}`);
  }
}

async function move(id, dir) {
  await reorder(moveInOrder(state.data.shortcuts, id, dir));
  await refresh();
}

function addShortcut() {
  if (!confirmDiscard()) return;
  const draft = blankShortcut(newId());
  openDraft(draft, true);
  state.dirty = false;
}

function showImportPanel(plan, onApply) {
  const panel = $('import-panel');
  panel.hidden = false;
  panel.replaceChildren();
  const add = (tag, text, cls) => {
    const n = document.createElement(tag);
    n.textContent = text;
    if (cls) n.className = cls;
    panel.append(n);
    return n;
  };
  if (!plan.ok) {
    add('h3', 'Import failed — nothing was changed');
    for (const e of plan.errors) add('p', e, 'err');
  } else {
    add('h3', `Import preview: ${plan.data.shortcuts.length} shortcut(s)`);
    const ul = document.createElement('ul');
    for (const s of plan.data.shortcuts) {
      const li = document.createElement('li');
      li.textContent = `${s.keyword} (${s.steps.length} step${s.steps.length === 1 ? '' : 's'})`;
      ul.append(li);
    }
    panel.append(ul);
    for (const w of plan.warnings) add('p', w, 'warn');
    for (const mode of ['merge', 'replace']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = `import-${mode}`;
      b.textContent = mode === 'merge' ? 'Merge into current' : 'Replace all';
      b.addEventListener('click', () => onApply(mode));
      panel.append(b);
    }
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => (panel.hidden = true));
  panel.append(close);
}

async function onImportFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const plan = planImport(await file.text());
  showImportPanel(plan, async (mode) => {
    try {
      await saveAll(applyImport(mode, await loadAll(), plan.data), {
        stepValidators: portableValidators,
      });
      $('import-panel').hidden = true;
      state.draft = null;
      state.selectedId = null;
      state.dirty = false;
      renderEditorPane();
      await refresh();
      status(`Imported ${plan.data.shortcuts.length} shortcut(s) (${mode}).`);
    } catch (err) {
      status(`Import failed: ${err.message}`);
    }
  });
}

export async function init() {
  applyTheme();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  $('search').addEventListener('input', (e) => {
    state.filter = e.target.value;
    renderShortcutList();
  });
  $('add-shortcut').addEventListener('click', addShortcut);
  $('undo-btn').addEventListener('click', undoDelete);
  $('export-btn').addEventListener('click', async () => {
    const d = buildExport(await loadAll());
    downloadJson(d, `keyword-launcher-${new Date().toISOString().slice(0, 10)}.json`);
  });
  $('import-file').addEventListener('change', onImportFile);
  window.addEventListener('beforeunload', (e) => {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== 'sync') return;
    await refresh();
    if (!state.dirty && state.selectedId && !state.isNew) {
      const sc = state.data.shortcuts.find((s) => s.id === state.selectedId);
      if (sc) openDraft(sc, false);
      else {
        state.draft = null;
        state.selectedId = null;
        renderEditorPane();
      }
    }
  });
  await refresh();
}

init();

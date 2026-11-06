import { el } from './step-editor.js';

/**
 * Render the shortcut list.
 * @param {HTMLElement} ul
 * @param {{shortcuts:object[], selectedId:string|null, filter:string, handlers:{onSelect,onDuplicate,onDelete,onMove}}} o
 */
export function renderList(ul, { shortcuts, selectedId, filter, handlers }) {
  ul.replaceChildren();
  const needle = filter.trim().toLowerCase();
  shortcuts.forEach((sc, i) => {
    const visible =
      !needle ||
      sc.keyword.toLowerCase().includes(needle) ||
      (sc.description || '').toLowerCase().includes(needle);
    const li = el('li', { 'data-id': sc.id, class: sc.id === selectedId ? 'selected' : '' });
    li.hidden = !visible;
    li.append(
      el(
        'button',
        { type: 'button', class: 'item', onclick: () => handlers.onSelect(sc.id) },
        document.createTextNode(sc.keyword),
        el('small', { text: sc.description || '' })
      ),
      el(
        'div',
        { class: 'row' },
        el('button', {
          type: 'button',
          'aria-label': `Move ${sc.keyword} up`,
          text: '↑',
          disabled: i === 0,
          onclick: () => handlers.onMove(sc.id, -1),
        }),
        el('button', {
          type: 'button',
          'aria-label': `Move ${sc.keyword} down`,
          text: '↓',
          disabled: i === shortcuts.length - 1,
          onclick: () => handlers.onMove(sc.id, 1),
        }),
        el('button', {
          type: 'button',
          'aria-label': `Duplicate ${sc.keyword}`,
          text: 'Duplicate',
          onclick: () => handlers.onDuplicate(sc.id),
        }),
        el('button', {
          type: 'button',
          'aria-label': `Delete ${sc.keyword}`,
          text: 'Delete',
          onclick: () => handlers.onDelete(sc.id),
        })
      )
    );
    ul.append(li);
  });
}

export const newId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Copy a shortcut with a fresh id and a unique "-copy" keyword. */
export function duplicateShortcut(sc, existing) {
  const taken = new Set(existing.map((s) => s.keyword));
  let kw = `${sc.keyword}-copy`.slice(0, 32);
  for (let n = 2; taken.has(kw); n++) kw = `${sc.keyword.slice(0, 28)}-copy${n}`;
  return { ...structuredClone(sc), id: newId(), keyword: kw };
}

export function moveInOrder(shortcuts, id, dir) {
  const ids = shortcuts.map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

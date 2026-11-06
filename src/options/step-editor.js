import { registry } from '../actions/index.js';

let uid = 0;
export const nextId = (p = 'f') => `${p}-${++uid}`;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}
export { el };

function errorLine(path, id) {
  return el('p', { class: 'err', id, 'data-err': path, role: 'alert' });
}

/** One labelled control for a field, wired to step[field.name]. */
function renderField(field, step, index, onChange) {
  const id = nextId(`s${index}-${field.name}`);
  const errId = `${id}-err`;
  const wrap = el('div', { class: 'field' });
  const set = (v) => {
    step[field.name] = v;
    onChange();
  };
  const common = { id, 'aria-describedby': errId };

  if (field.kind === 'checkbox') {
    const input = el('input', { ...common, type: 'checkbox' });
    input.checked = Boolean(step[field.name] ?? field.default);
    input.addEventListener('change', () => set(input.checked));
    wrap.append(
      el('label', { class: 'checkbox', for: id }, input, document.createTextNode(field.label))
    );
  } else if (field.kind === 'urls') {
    wrap.append(el('label', { for: `${id}-0`, text: field.label }));
    const list = el('div', { class: 'urls' });
    const draw = () => {
      list.replaceChildren();
      step.urls.forEach((u, i) => {
        const input = el('input', {
          type: 'text',
          id: `${id}-${i}`,
          'aria-label': `URL ${i + 1}`,
          'aria-describedby': errId,
          value: u,
        });
        input.addEventListener('input', () => {
          step.urls[i] = input.value;
          onChange();
        });
        const rm = el('button', {
          type: 'button',
          'aria-label': `Remove URL ${i + 1}`,
          text: '✕',
          onclick: () => {
            step.urls.splice(i, 1);
            draw();
            onChange();
          },
        });
        list.append(el('div', { class: 'urlrow' }, input, rm));
      });
    };
    draw();
    wrap.append(
      list,
      el('button', {
        type: 'button',
        text: 'Add URL',
        onclick: () => {
          step.urls.push('');
          draw();
          onChange();
        },
      })
    );
    wrap.append(errorLine(`urls`, errId));
    if (field.help) wrap.append(el('p', { class: 'muted', text: field.help }));
    return wrap;
  } else {
    wrap.append(el('label', { for: id, text: field.label }));
    let input;
    if (field.kind === 'select') {
      input = el('select', common);
      for (const o of field.options) input.append(el('option', { value: o.value, text: o.label }));
      input.value = step[field.name] ?? field.default;
      input.addEventListener('change', () => set(input.value));
    } else if (field.kind === 'textarea' || field.kind === 'code') {
      input = el('textarea', { ...common, spellcheck: field.kind === 'code' ? 'false' : null });
      input.value = step[field.name] ?? '';
      input.addEventListener('input', () => set(input.value));
    } else if (field.kind === 'number') {
      input = el('input', { ...common, type: 'number', min: field.min, max: field.max });
      input.value = step[field.name] ?? field.default ?? '';
      input.addEventListener('input', () => set(input.value === '' ? NaN : Number(input.value)));
    } else {
      input = el('input', { ...common, type: 'text' });
      input.value = step[field.name] ?? '';
      input.addEventListener('input', () => set(input.value));
    }
    wrap.append(input);
  }
  wrap.append(errorLine(field.name, errId));
  if (field.help) wrap.append(el('p', { class: 'muted', text: field.help }));
  return wrap;
}

/**
 * Render one step's form from its action's `fields`.
 * @param {object} step the (mutable) step object
 * @param {number} index
 * @param {{onChange:()=>void,onRemove:()=>void,onMove:(dir:-1|1)=>void,rerender:()=>void,canMoveUp:boolean,canMoveDown:boolean}} h
 */
export function renderStep(step, index, h) {
  const action = registry[step.type];
  const box = el('div', {
    class: 'step',
    'data-step': index,
    role: 'group',
    'aria-label': `Step ${index + 1}`,
  });
  const tools = el(
    'div',
    { class: 'tools' },
    el('button', {
      type: 'button',
      'aria-label': `Move step ${index + 1} up`,
      text: '↑',
      disabled: !h.canMoveUp,
      onclick: () => h.onMove(-1),
    }),
    el('button', {
      type: 'button',
      'aria-label': `Move step ${index + 1} down`,
      text: '↓',
      disabled: !h.canMoveDown,
      onclick: () => h.onMove(1),
    }),
    el('button', {
      type: 'button',
      'aria-label': `Remove step ${index + 1}`,
      text: '✕',
      onclick: h.onRemove,
    })
  );
  box.append(
    el(
      'header',
      {},
      el('h3', { text: `${index + 1}. ${action ? action.label : step.type}` }),
      tools
    )
  );

  if (!action) {
    box.append(
      el('p', { class: 'warn', text: `Unknown step type "${step.type}". It is kept but disabled.` })
    );
    return box;
  }

  const unavailable = action.needsPermission && !action.available?.();
  if (unavailable) {
    box.append(
      el('p', {
        class: 'muted',
        text: 'This step needs the "user scripts" permission (Chrome 135 or newer).',
      }),
      el('button', {
        type: 'button',
        class: 'enable-user-scripts',
        text: 'Enable user scripts',
        onclick: async () => {
          const granted = await chrome.permissions.request({
            permissions: [action.needsPermission],
          });
          if (granted) h.rerender();
        },
      }),
      errorLine('code', nextId('err'))
    );
    return box;
  }

  for (const field of action.fields) box.append(renderField(field, step, index, h.onChange));
  const cont = el('input', { type: 'checkbox', id: nextId('coe') });
  cont.checked = Boolean(step.continueOnError);
  cont.addEventListener('change', () => {
    step.continueOnError = cont.checked;
    h.onChange();
  });
  box.append(
    el(
      'label',
      { class: 'checkbox', for: cont.id },
      cont,
      document.createTextNode('Continue if this step fails')
    )
  );
  box.append(errorLine('', nextId('err')));
  return box;
}

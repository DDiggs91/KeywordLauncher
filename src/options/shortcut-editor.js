import { registry, actions, stepValidators } from '../actions/index.js';
import { validateShortcut } from '../lib/schema.js';
import { el, renderStep } from './step-editor.js';

export function blankShortcut(id) {
  return {
    id,
    keyword: '',
    description: '',
    requiresQuery: false,
    steps: [registry.openUrls.defaults()],
  };
}

/**
 * Render the editor for a draft shortcut.
 * @param {HTMLElement} root
 * @param {{draft:object, others:object[], isNew:boolean, onDirty:()=>void, onSave:(draft:object)=>Promise<void>,
 *          onTest:(draft:object, query:string)=>Promise<{ok:boolean,log:object[]}>}} o
 */
export function renderEditor(root, { draft, others, onDirty, onSave, onTest }) {
  root.replaceChildren();
  const form = el('form', { novalidate: true });
  form.addEventListener('submit', (e) => e.preventDefault());

  const field = (label, control, path) => {
    const id = `ed-${path}`;
    control.id = id;
    control.setAttribute('aria-describedby', `${id}-err`);
    return el(
      'div',
      { class: 'field' },
      el('label', { for: id, text: label }),
      control,
      el('p', { class: 'err', id: `${id}-err`, 'data-err': path, role: 'alert' })
    );
  };

  const keyword = el('input', { type: 'text', autocomplete: 'off', maxlength: '64' });
  keyword.value = draft.keyword;
  const description = el('input', { type: 'text' });
  description.value = draft.description ?? '';
  const requires = el('input', { type: 'checkbox', id: 'ed-requiresQuery' });
  requires.checked = Boolean(draft.requiresQuery);

  const stepsBox = el('div', { class: 'steps' });
  const saveBtn = el('button', { type: 'submit', class: 'primary', text: 'Save', id: 'save-btn' });
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    await onSave(draft);
  });
  const logBox = el('div', { 'aria-live': 'polite' });

  const refresh = () => {
    const { errors } = validateShortcut(draft, { others, stepValidators });
    form.querySelectorAll('[data-err]').forEach((n) => (n.textContent = ''));
    const stepErrs = new Map();
    for (const e of errors) {
      const m = /^steps\[(\d+)\](?:\.(.*))?$/.exec(e.path);
      if (m) {
        const box = stepsBox.querySelector(`[data-step="${m[1]}"]`);
        const sub = (m[2] ?? '').replace(/\[\d+\]$/, '');
        const target =
          box?.querySelector(`[data-err="${sub}"]`) ?? box?.querySelector('[data-err=""]');
        if (target)
          target.textContent = target.textContent
            ? `${target.textContent} ${e.message}`
            : e.message;
        stepErrs.set(m[1], true);
      } else {
        const target = form.querySelector(`[data-err="${e.path}"]`);
        if (target) target.textContent = e.message;
      }
    }
    saveBtn.disabled = errors.length > 0;
    return errors;
  };

  const touched = () => {
    onDirty();
    refresh();
  };

  const drawSteps = () => {
    stepsBox.replaceChildren();
    draft.steps.forEach((step, i) =>
      stepsBox.append(
        renderStep(step, i, {
          onChange: touched,
          onRemove: () => {
            draft.steps.splice(i, 1);
            drawSteps();
            touched();
          },
          onMove: (dir) => {
            const j = i + dir;
            [draft.steps[i], draft.steps[j]] = [draft.steps[j], draft.steps[i]];
            drawSteps();
            touched();
          },
          rerender: () => {
            drawSteps();
            refresh();
          },
          canMoveUp: i > 0,
          canMoveDown: i < draft.steps.length - 1,
        })
      )
    );
    stepsBox.append(el('p', { class: 'err', 'data-err': 'steps', role: 'alert' }));
    refresh();
  };

  keyword.addEventListener('input', () => {
    draft.keyword = keyword.value;
    touched();
  });
  description.addEventListener('input', () => {
    draft.description = description.value;
    touched();
  });
  requires.addEventListener('change', () => {
    draft.requiresQuery = requires.checked;
    touched();
  });

  const typeSelect = el('select', { id: 'add-step-type', 'aria-label': 'Step type' });
  for (const a of actions) typeSelect.append(el('option', { value: a.type, text: a.label }));
  const addStep = el('button', {
    type: 'button',
    id: 'add-step-btn',
    text: 'Add step',
    onclick: () => {
      draft.steps.push(registry[typeSelect.value].defaults());
      drawSteps();
      touched();
    },
  });

  const testQuery = el('input', {
    type: 'text',
    id: 'test-query',
    placeholder: 'Query (optional)',
  });
  const testBtn = el('button', {
    type: 'button',
    id: 'test-btn',
    text: 'Test run',
    onclick: async () => {
      logBox.replaceChildren(el('p', { class: 'muted', text: 'Running…' }));
      const result = await onTest(draft, testQuery.value);
      const ul = el('ul', { class: 'log' });
      for (const l of result.log) {
        ul.append(
          el('li', {
            class: l.status,
            text: `${l.index >= 0 ? l.index + 1 + '. ' : ''}${l.type}: ${l.status}${l.message ? ' — ' + l.message : ''}`,
          })
        );
      }
      logBox.replaceChildren(
        el('p', { text: result.ok ? 'Test run finished.' : 'Test run failed.' }),
        ul
      );
    },
  });

  form.append(
    el('h2', { text: draft.keyword ? `Edit "${draft.keyword}"` : 'New shortcut' }),
    field('Keyword', keyword, 'keyword'),
    field('Description', description, 'description'),
    el(
      'label',
      { class: 'checkbox', for: 'ed-requiresQuery' },
      requires,
      document.createTextNode('Requires a query (e.g. "go jira 123")')
    ),
    el('h3', { text: 'Steps' }),
    stepsBox,
    el('div', { class: 'row' }, typeSelect, addStep),
    el('div', { class: 'row' }, saveBtn),
    el('h3', { text: 'Try it' }),
    el(
      'div',
      { class: 'row' },
      el('label', { for: 'test-query', text: 'Query' }),
      testQuery,
      testBtn
    ),
    logBox
  );
  root.append(form);
  drawSteps();
}

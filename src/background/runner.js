import { registry as defaultRegistry } from '../actions/index.js';
import { fillTemplate, MissingQuery } from '../lib/template.js';

export const STEP_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run a shortcut's steps in order with a shared context. Never throws.
 * Keeps no global state (the MV3 service worker may be restarted at any time).
 * @returns {Promise<{ok: boolean, log: {index:number,type:string,status:'ok'|'error'|'skipped'|'warning',message?:string}[]}>}
 */
export async function runShortcut(
  shortcut,
  { query = '', disposition = 'currentTab', registry = defaultRegistry } = {}
) {
  const log = [];
  const requiresQuery = Boolean(shortcut.requiresQuery);

  if (requiresQuery && !query) {
    const e = new MissingQuery(
      `"${shortcut.keyword}" needs a query, e.g. "go ${shortcut.keyword} something".`
    );
    return {
      ok: false,
      log: [{ index: -1, type: 'shortcut', status: 'error', message: e.message }],
    };
  }

  let current = -1;
  const ctx = {
    query,
    requiresQuery,
    disposition,
    tabIds: [],
    windowId: undefined,
    fill: (str, { raw = false } = {}) =>
      fillTemplate(raw ? String(str).replace(/\{query\}/g, '{query:raw}') : str, query, {
        requiresQuery,
      }),
    warn: (message) =>
      log.push({ index: current, type: shortcut.steps[current]?.type, status: 'warning', message }),
  };

  let ok = true;
  for (let i = 0; i < shortcut.steps.length; i++) {
    const step = shortcut.steps[i];
    current = i;
    const action = registry[step.type];
    if (step.disabled || !action) {
      log.push({
        index: i,
        type: step.type,
        status: 'skipped',
        message: action ? 'Step is disabled.' : 'Unknown step type.',
      });
      continue;
    }
    try {
      const ms = step.type === 'wait' ? STEP_TIMEOUT_MS + (step.ms || 0) : STEP_TIMEOUT_MS;
      await withTimeout(Promise.resolve(action.run(step, ctx)), ms, action.label);
      log.push({ index: i, type: step.type, status: 'ok' });
    } catch (e) {
      log.push({ index: i, type: step.type, status: 'error', message: e?.message ?? String(e) });
      if (!step.continueOnError) {
        ok = false;
        break;
      }
    }
  }
  return { ok, log };
}

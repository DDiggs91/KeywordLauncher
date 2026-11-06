// Hand-written validation (Ajv generates code at runtime, which the extension CSP forbids).
// schemas/export.schema.json describes the same format; scripts/validate.js and the tests
// check both agree.

export const CURRENT_VERSION = 1;
export const KNOWN_STEP_TYPES = [
  'openUrls',
  'tabGroup',
  'closeTabs',
  'pinTabs',
  'muteTabs',
  'copyText',
  'wait',
  'runScript',
];
export const LIMITS = {
  keywordMax: 32,
  descriptionMax: 120,
  stepsMin: 1,
  stepsMax: 25,
  urlsMin: 1,
  urlsMax: 20,
  itemBytes: 8000,
  totalBytes: 100000,
};
export const UNKNOWN_KEYWORD_OPTIONS = ['search', 'nothing'];
export const TARGET_OPTIONS = ['currentTab', 'newForegroundTab', 'newBackgroundTab'];
export const DEFAULT_SETTINGS = { unknownKeyword: 'search', defaultTarget: 'currentTab' };

const KEYWORD_RE = /^[a-z0-9_-]+$/;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate one shortcut.
 * @param {object} sc
 * @param {{others?: object[], stepValidators?: Record<string,(step:object)=>{path?:string,message:string}[]>}} opts
 *   others: other shortcuts (for duplicate detection). stepValidators: per-type extra checks.
 * @returns {{errors: {path:string,message:string}[], warnings: {path:string,message:string}[], shortcut: object}}
 */
export function validateShortcut(sc, { others = [], stepValidators = {} } = {}) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });

  if (!isObj(sc)) {
    return {
      errors: [{ path: '', message: 'Shortcut must be an object.' }],
      warnings,
      shortcut: sc,
    };
  }
  const out = { ...sc };

  // keyword
  const keyword = typeof sc.keyword === 'string' ? sc.keyword.trim().toLowerCase() : '';
  if (typeof sc.keyword !== 'string' || !keyword) {
    err('keyword', 'Keyword is required.');
  } else if (keyword.length > LIMITS.keywordMax) {
    err('keyword', `Keyword must be at most ${LIMITS.keywordMax} characters.`);
  } else if (!KEYWORD_RE.test(keyword)) {
    err('keyword', 'Use only letters, numbers, "-" and "_" (no spaces).');
  }
  out.keyword = keyword;
  if (keyword) {
    const dup = others.find((o) => o.id !== sc.id && String(o.keyword).toLowerCase() === keyword);
    if (dup) err('keyword', `Keyword "${keyword}" is already used by another shortcut.`);
  }

  // description
  if (sc.description === undefined) out.description = '';
  else if (typeof sc.description !== 'string') err('description', 'Description must be text.');
  else if (sc.description.length > LIMITS.descriptionMax) {
    err('description', `Description must be at most ${LIMITS.descriptionMax} characters.`);
  }

  if (sc.requiresQuery !== undefined && typeof sc.requiresQuery !== 'boolean') {
    err('requiresQuery', 'requiresQuery must be true or false.');
  }
  if (typeof sc.id !== 'string' || !sc.id) err('id', 'Shortcut id is required.');

  // steps
  if (!Array.isArray(sc.steps) || sc.steps.length < LIMITS.stepsMin) {
    err('steps', 'Add at least one step.');
  } else if (sc.steps.length > LIMITS.stepsMax) {
    err('steps', `A shortcut can have at most ${LIMITS.stepsMax} steps.`);
  } else {
    out.steps = sc.steps.map((step, i) => {
      const p = `steps[${i}]`;
      if (!isObj(step) || typeof step.type !== 'string') {
        err(p, 'Step must have a type.');
        return step;
      }
      if (!KNOWN_STEP_TYPES.includes(step.type)) {
        warnings.push({
          path: p,
          message: `Unknown step type "${step.type}"; it will be disabled.`,
        });
        return { ...step, disabled: true };
      }
      if (step.type === 'openUrls') {
        if (!Array.isArray(step.urls) || step.urls.length < LIMITS.urlsMin) {
          err(`${p}.urls`, 'Add at least one URL.');
        } else if (step.urls.length > LIMITS.urlsMax) {
          err(`${p}.urls`, `At most ${LIMITS.urlsMax} URLs per step.`);
        }
      }
      for (const e of stepValidators[step.type]?.(step) ?? []) {
        err(e.path ? `${p}.${e.path}` : p, e.message);
      }
      return step;
    });
  }
  return { errors, warnings, shortcut: out };
}

export function validateSettings(settings) {
  const errors = [];
  if (!isObj(settings)) return [{ path: 'settings', message: 'Settings must be an object.' }];
  if (!UNKNOWN_KEYWORD_OPTIONS.includes(settings.unknownKeyword)) {
    errors.push({ path: 'settings.unknownKeyword', message: 'Must be "search" or "nothing".' });
  }
  if (!TARGET_OPTIONS.includes(settings.defaultTarget)) {
    errors.push({ path: 'settings.defaultTarget', message: 'Invalid default target.' });
  }
  return errors;
}

/** Validate a whole export file ({version, settings, shortcuts}). */
export function validateExport(data, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!isObj(data)) {
    return { errors: [{ path: '', message: 'File must contain a JSON object.' }], warnings, data };
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version)) {
    errors.push({ path: 'version', message: 'Missing "version" field.' });
  } else if (data.version > CURRENT_VERSION) {
    errors.push({
      path: 'version',
      message: `File version ${data.version} is newer than this extension supports (${CURRENT_VERSION}).`,
    });
  } else if (data.version < 1) {
    errors.push({ path: 'version', message: 'Invalid version.' });
  }
  const settings = { ...DEFAULT_SETTINGS, ...(isObj(data.settings) ? data.settings : {}) };
  if (data.settings !== undefined) errors.push(...validateSettings(settings));
  if (!Array.isArray(data.shortcuts)) {
    errors.push({ path: 'shortcuts', message: '"shortcuts" must be a list.' });
    return { errors, warnings, data };
  }
  const seen = [];
  const shortcuts = data.shortcuts.map((sc, i) => {
    const r = validateShortcut(sc, { ...opts, others: seen });
    for (const e of r.errors)
      errors.push({ ...e, path: `shortcuts[${i}]${e.path ? '.' + e.path : ''}` });
    for (const w of r.warnings) warnings.push({ ...w, path: `shortcuts[${i}].${w.path}` });
    seen.push(r.shortcut);
    return r.shortcut;
  });
  return { errors, warnings, data: { version: CURRENT_VERSION, settings, shortcuts } };
}

import openUrls from './openUrls.js';
import tabGroup from './tabGroup.js';
import closeTabs from './closeTabs.js';
import pinTabs from './pinTabs.js';
import muteTabs from './muteTabs.js';
import copyText from './copyText.js';
import wait from './wait.js';
import runScript from './runScript.js';

export const actions = [
  openUrls,
  tabGroup,
  closeTabs,
  pinTabs,
  muteTabs,
  copyText,
  wait,
  runScript,
];
export const registry = Object.fromEntries(actions.map((a) => [a.type, a]));

/** Per-type validators for lib/schema.js (used by the editor). */
export const stepValidators = Object.fromEntries(
  actions.map((a) => [a.type, (step) => a.validate(step)])
);

/** Same, minus checks that depend on the current browser (permissions), for import and storage. */
export const portableValidators = {
  ...stepValidators,
  runScript: (step) =>
    step.code?.trim() ? [] : [{ path: 'code', message: 'Enter some JavaScript.' }],
};

/** True when the userScripts permission is granted and the API exists (Chrome 135+). */
export function userScriptsAvailable() {
  return typeof globalThis.chrome?.userScripts?.execute === 'function';
}

export default {
  type: 'runScript',
  label: 'Run script (advanced)',
  needsPermission: 'userScripts',
  available: userScriptsAvailable,
  fields: [
    {
      name: 'code',
      label: 'JavaScript (runs in the active tab; QUERY holds the typed query)',
      kind: 'code',
      required: true,
    },
  ],
  defaults: () => ({ type: 'runScript', code: '' }),
  validate(step) {
    const errors = [];
    if (!userScriptsAvailable()) {
      errors.push({
        path: 'code',
        message: 'Enable user scripts for this extension to use this step.',
      });
    }
    if (!step.code?.trim()) errors.push({ path: 'code', message: 'Enter some JavaScript.' });
    return errors;
  },
  async run(step, ctx) {
    if (!userScriptsAvailable())
      throw new Error('User scripts are not enabled for this extension.');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab to run the script in.');
    const code = `(function (QUERY) {\n${step.code}\n})(${JSON.stringify(ctx.query ?? '')});`;
    await chrome.userScripts.execute({ target: { tabId: tab.id }, js: [{ code }] });
  },
};

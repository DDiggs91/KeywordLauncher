export default {
  type: 'copyText',
  label: 'Copy text',
  fields: [
    {
      name: 'text',
      label: 'Text to copy',
      kind: 'textarea',
      required: true,
      help: 'Use {query:raw} for the unencoded query.',
    },
  ],
  defaults: () => ({ type: 'copyText', text: '' }),
  validate(step) {
    return step.text ? [] : [{ path: 'text', message: 'Enter text to copy.' }];
  },
  async run(step, ctx) {
    // Service workers have no clipboard, so an offscreen document does the write.
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/clipboard.html',
        reasons: ['CLIPBOARD'],
        justification: 'Write text to the clipboard for the Copy text step.',
      });
    }
    const reply = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'copy',
      text: ctx.fill(step.text, { raw: true }),
    });
    if (!reply?.ok) throw new Error(reply?.error || 'Copying to the clipboard failed.');
  },
};

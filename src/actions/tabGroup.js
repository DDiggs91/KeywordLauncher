const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

export default {
  type: 'tabGroup',
  label: 'Group tabs',
  fields: [
    { name: 'name', label: 'Group name', kind: 'text', max: 60 },
    {
      name: 'color',
      label: 'Color',
      kind: 'select',
      default: 'blue',
      options: COLORS.map((c) => ({ value: c, label: c })),
    },
  ],
  defaults: () => ({ type: 'tabGroup', name: '', color: 'blue' }),
  validate(step) {
    const errors = [];
    if (!COLORS.includes(step.color ?? 'blue'))
      errors.push({ path: 'color', message: 'Pick a valid color.' });
    if (typeof step.name === 'string' && step.name.length > 60) {
      errors.push({ path: 'name', message: 'Name must be at most 60 characters.' });
    }
    return errors;
  },
  async run(step, ctx) {
    if (!ctx.tabIds.length) {
      ctx.warn('No tabs were opened earlier in this run, so there is nothing to group.');
      return;
    }
    const groupId = await chrome.tabs.group({ tabIds: [...ctx.tabIds] });
    await chrome.tabGroups.update(groupId, {
      title: ctx.fill(step.name ?? ''),
      color: step.color ?? 'blue',
    });
  },
};

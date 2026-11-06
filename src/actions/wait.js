export default {
  type: 'wait',
  label: 'Wait',
  fields: [{ name: 'ms', label: 'Milliseconds', kind: 'number', min: 0, max: 10000, default: 500 }],
  defaults: () => ({ type: 'wait', ms: 500 }),
  validate(step) {
    return Number.isInteger(step.ms) && step.ms >= 0 && step.ms <= 10000
      ? []
      : [{ path: 'ms', message: 'Wait must be a whole number from 0 to 10,000 ms.' }];
  },
  run: (step) => new Promise((resolve) => setTimeout(resolve, step.ms)),
};

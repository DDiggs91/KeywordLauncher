import { describe, it, expect } from 'vitest';
import { validateShortcut, validateExport, validateSettings } from '../../src/lib/schema.js';

const sc = (o = {}) => ({
  id: 'a1',
  keyword: 'work',
  description: 'd',
  steps: [{ type: 'openUrls', urls: ['https://a.com'], target: 'newTabs' }],
  ...o,
});
const paths = (r) => r.errors.map((e) => e.path);

describe('schema', () => {
  it('S1 valid shortcut', () => expect(validateShortcut(sc()).errors).toEqual([]));
  it('S2 keyword with space', () =>
    expect(paths(validateShortcut(sc({ keyword: 'a b' })))).toContain('keyword'));
  it('S3 keyword 33 chars', () =>
    expect(paths(validateShortcut(sc({ keyword: 'a'.repeat(33) })))).toContain('keyword'));
  it('S4 duplicate keyword case-insensitive', () => {
    const r = validateShortcut(sc({ id: 'b2', keyword: 'Work' }), { others: [sc()] });
    expect(r.errors[0].path).toBe('keyword');
    expect(r.errors[0].message).toMatch(/already used/);
  });
  it('S5 zero steps', () => expect(paths(validateShortcut(sc({ steps: [] })))).toContain('steps'));
  it('S6 26 steps', () => {
    const steps = Array.from({ length: 26 }, () => ({ type: 'wait', ms: 1 }));
    expect(paths(validateShortcut(sc({ steps })))).toContain('steps');
  });
  it('S7 21 urls', () => {
    const urls = Array.from({ length: 21 }, (_, i) => `https://a.com/${i}`);
    expect(paths(validateShortcut(sc({ steps: [{ type: 'openUrls', urls }] })))).toContain(
      'steps[0].urls'
    );
  });
  it('S8 unknown step type kept and disabled with warning', () => {
    const r = validateShortcut(sc({ steps: [{ type: 'teleport', x: 1 }] }));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.shortcut.steps[0]).toEqual({ type: 'teleport', x: 1, disabled: true });
  });
  it('S9 export missing version', () => {
    const r = validateExport({ shortcuts: [] });
    expect(paths(r)).toContain('version');
  });
  it('S10 newer version', () => {
    const r = validateExport({ version: 99, shortcuts: [] });
    expect(r.errors[0].message).toMatch(/newer than this extension/);
  });

  it('misc shortcut errors', () => {
    expect(validateShortcut(null).errors).toHaveLength(1);
    const r = validateShortcut({
      keyword: '',
      description: 5,
      requiresQuery: 'x',
      steps: [5, { type: 'openUrls', urls: [] }],
    });
    expect(paths(r)).toEqual(
      expect.arrayContaining([
        'keyword',
        'description',
        'requiresQuery',
        'id',
        'steps[0]',
        'steps[1].urls',
      ])
    );
    expect(paths(validateShortcut(sc({ description: 'x'.repeat(121) })))).toContain('description');
    expect(validateShortcut({ ...sc(), description: undefined }).shortcut.description).toBe('');
  });
  it('runs injected step validators with prefixed paths', () => {
    const r = validateShortcut(sc(), {
      stepValidators: {
        openUrls: () => [{ path: 'urls[0]', message: 'bad' }, { message: 'whole' }],
      },
    });
    expect(paths(r)).toEqual(['steps[0].urls[0]', 'steps[0]']);
  });
  it('export validation: shape, settings, per-shortcut paths and duplicates', () => {
    expect(validateExport(5).errors).toHaveLength(1);
    expect(paths(validateExport({ version: 1 }))).toContain('shortcuts');
    expect(paths(validateExport({ version: 0, shortcuts: [] }))).toContain('version');
    expect(
      paths(validateExport({ version: 1, settings: { unknownKeyword: 'x' }, shortcuts: [] }))
    ).toEqual(
      expect.arrayContaining(['settings.unknownKeyword', 'settings.defaultTarget'].slice(0, 1))
    );
    const r = validateExport({
      version: 1,
      shortcuts: [
        sc(),
        sc({ id: 'b', keyword: 'WORK' }),
        sc({ id: 'c', keyword: 'other', steps: [{ type: 'zz' }] }),
      ],
    });
    expect(paths(r)).toEqual(['shortcuts[1].keyword']);
    expect(r.warnings[0].path).toBe('shortcuts[2].steps[0]');
    expect(r.data.settings.defaultTarget).toBe('currentTab');
  });
  it('validateSettings', () => {
    expect(validateSettings(null)).toHaveLength(1);
    expect(validateSettings({ unknownKeyword: 'search', defaultTarget: 'x' })).toHaveLength(1);
    expect(
      validateSettings({ unknownKeyword: 'nothing', defaultTarget: 'newForegroundTab' })
    ).toEqual([]);
  });
});

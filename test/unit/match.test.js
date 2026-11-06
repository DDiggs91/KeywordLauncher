import { describe, it, expect } from 'vitest';
import { matchShortcuts } from '../../src/lib/match.js';

const mk = (keyword, id = keyword, description = '') => ({ id, keyword, description });

describe('match', () => {
  it('M1 exact first', () => {
    const r = matchShortcuts([mk('workday'), mk('work')], 'work');
    expect(r.map((s) => s.keyword)).toEqual(['work', 'workday']);
  });
  it('M2 prefix before substring', () => {
    const r = matchShortcuts([mk('network'), mk('work'), mk('wolf')], 'wo');
    expect(r.map((s) => s.keyword)).toEqual(['work', 'wolf', 'network']);
  });
  it('M3 ties by recent use', () => {
    const r = matchShortcuts([mk('aa'), mk('ab')], 'a', { ab: 10, aa: 5 });
    expect(r.map((s) => s.keyword)).toEqual(['ab', 'aa']);
  });
  it('M4 limits to 5', () => {
    const list = Array.from({ length: 12 }, (_, i) => mk(`wo${i}`));
    expect(matchShortcuts(list, 'wo')).toHaveLength(5);
  });
  it('M5 case-insensitive', () =>
    expect(matchShortcuts([mk('work')], 'WO').map((s) => s.keyword)).toEqual(['work']));
  it('matches description last and drops non-matches', () => {
    const r = matchShortcuts([mk('zzz', 'z', 'morning tabs'), mk('qqq')], 'morn');
    expect(r.map((s) => s.keyword)).toEqual(['zzz']);
  });
  it('empty text returns all by usage', () => {
    expect(matchShortcuts([mk('a'), mk('b')], '', { b: 1 }).map((s) => s.keyword)).toEqual([
      'b',
      'a',
    ]);
    expect(matchShortcuts([mk('a')], undefined)).toHaveLength(1);
  });
});

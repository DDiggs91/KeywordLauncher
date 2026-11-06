import { describe, it, expect } from 'vitest';
import { fillTemplate, fillDeep, MissingQuery } from '../../src/lib/template.js';

describe('template', () => {
  it('T1 encodes {query}', () => expect(fillTemplate('{query}', 'a b&c')).toBe('a%20b%26c'));
  it('T2 {query:raw}', () => expect(fillTemplate('{query:raw}', 'a b')).toBe('a b'));
  it('T3 replaces all occurrences', () =>
    expect(fillTemplate('x/{query}/y/{query}', 'q')).toBe('x/q/y/q'));
  it('T4 no query becomes empty', () => expect(fillTemplate('a{query}b', '')).toBe('ab'));
  it('T5 requiresQuery throws MissingQuery', () => {
    expect(() => fillTemplate('a{query}', '', { requiresQuery: true })).toThrow(MissingQuery);
    expect(() => fillTemplate('a{query}', '', { requiresQuery: true })).toThrow(/needs a query/);
  });
  it('T6 unknown tokens untouched', () => expect(fillTemplate('{foo}', 'x')).toBe('{foo}'));
  it('T7 query is not re-expanded', () =>
    expect(fillTemplate('{query:raw}', '{query}')).toBe('{query}'));
  it('non-strings pass through', () => expect(fillTemplate(5, 'x')).toBe(5));
  it('fillDeep handles nested values', () => {
    expect(fillDeep({ a: ['{query:raw}', 1], b: { c: '{query}' }, d: null }, 'x y')).toEqual({
      a: ['x y', 1],
      b: { c: 'x%20y' },
      d: null,
    });
  });
});

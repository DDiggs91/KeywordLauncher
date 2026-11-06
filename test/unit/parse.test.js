import { describe, it, expect } from 'vitest';
import { parseInput } from '../../src/lib/parse.js';

describe('parse', () => {
  it('P1 single word', () => expect(parseInput('work')).toEqual({ keyword: 'work', query: '' }));
  it('P2 keyword and query', () =>
    expect(parseInput('jira 123')).toEqual({ keyword: 'jira', query: '123' }));
  it('P3 trims, lowercases keyword, keeps query case and inner spaces', () =>
    expect(parseInput('  Work   foo  bar ')).toEqual({ keyword: 'work', query: 'foo  bar' }));
  it('P4 empty or whitespace is null', () => {
    expect(parseInput('')).toBeNull();
    expect(parseInput('   ')).toBeNull();
    expect(parseInput(undefined)).toBeNull();
  });
  it('P5 unicode', () =>
    expect(parseInput('CAFÉ menu')).toEqual({ keyword: 'café', query: 'menu' }));
});

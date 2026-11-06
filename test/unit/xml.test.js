import { describe, it, expect } from 'vitest';
import { escapeXml } from '../../src/lib/xml.js';

describe('xml', () => {
  it('X1 escapes specials', () => expect(escapeXml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&apos;'));
  it('X2 plain unchanged', () => expect(escapeXml('plain text')).toBe('plain text'));
  it('null becomes empty', () => expect(escapeXml(null)).toBe(''));
});

// Generates the oversized fixture (kept out of hand-editing so sizes stay exact).
import { writeFileSync } from 'node:fs';
const shortcuts = Array.from({ length: 20 }, (_, i) => ({
  id: `big-${i}`,
  keyword: `big${i}`,
  description: '',
  requiresQuery: false,
  steps: [{ type: 'copyText', text: 'x'.repeat(6000) }],
}));
writeFileSync('test/fixtures/oversized-export.json', JSON.stringify({ version: 1, shortcuts }));

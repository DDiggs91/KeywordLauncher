import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.js', 'test/dom/**/*.test.js', 'test/validate/**/*.test.js'],
    environmentMatchGlobs: [['test/dom/**', 'jsdom']],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/actions/**', 'src/background/**'],
      thresholds: { lines: 90, branches: 90 },
    },
  },
});

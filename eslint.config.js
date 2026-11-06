import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'dist-test/**',
      'release/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, chrome: 'writable' },
    },
  },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
];

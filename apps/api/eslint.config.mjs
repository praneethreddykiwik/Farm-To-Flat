// Minimal lint for the API (review #52, 21 Nov 2026): the API had no lint at all, in CI or locally.
// eslint:recommended catches the bugs that matter here — undefined names, duplicate keys,
// unreachable code. The rules below are relaxed only where today's code trips them on purpose, so
// this passes as-is and CI blocks on new errors without a clean-up commit first.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: {
      // The routes carry `eslint-disable no-console` from an older config that banned console.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // 9 leftovers today (unused imports and helpers). Visible as warnings, not blocking.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `try { JSON.parse(x) } catch {}` is the deliberate "try the next shape" idiom in routes/ai.js.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // The Telugu and Devanagari ranges in normalise() are whole-script ranges; the rule misreads
    // the combining marks inside them as a misleading class.
    files: ['src/lib/search.js'],
    rules: { 'no-misleading-character-class': 'off' },
  },
];

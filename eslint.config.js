// Lint rules that type checking can't catch, chiefly React's hook rules (missing effect
// dependencies, hooks called conditionally). `npm run lint` runs in the test check.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'node_modules', 'public', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // TypeScript already reports unknown names.
      'no-undef': 'off',
      // The code uses `a && b()` and comma expressions on purpose for short updates.
      '@typescript-eslint/no-unused-expressions': 'off',
      // Non-breaking and thin spaces in strings and patterns are deliberate (typography, PDF text).
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true, skipComments: true }],
      // A few spots wrap untyped libraries (pptxgenjs slides); flag new ones without failing.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Tests poke at browser and Tauri internals that have no types.
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Hook rules apply to the app only: Playwright fixtures also call a function named `use`.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);

// ESLint 9 flat config, ported from the Game Hub monorepo's root `eslint.config.js` and scoped to this
// single-package repo.
//
// Scope on purpose: this is a *pre-commit-speed* lint, not a second typechecker (`pnpm typecheck`
// already owns type correctness). So we run typescript-eslint's **recommended** (syntactic) rules only
// — no `recommendedTypeChecked`, which would spin up the TS program per lint and turn a fast
// hazard-check into a slow duplicate of tsc. Style is Prettier's job (eslint-config-prettier last
// disables anything stylistic). What we keep are the real hazards: React hooks deps, obvious bugs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Not source — never lint build outputs, deps, coverage.
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },

  // Baseline for every TS/TSX file.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `.mjs` covers `scripts/` (the D2d pack smoke) — plain Node, no TypeScript, but the same hazards.
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      // The engine, the module seam, `vitest.config.ts` and the scripts all run under Node.
      globals: { ...globals.node },
    },
    rules: {
      // A leading `_` marks an intentionally-unused binding (args, destructured rest, caught errors).
      // Everything else unused is a real error.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  // React + hooks — only `./client`, the one subpath that renders JSX.
  {
    ...react.configs.flat.recommended,
    files: ['src/client/**/*.{ts,tsx}'],
    settings: { react: { version: 'detect' } },
  },
  {
    // The automatic JSX runtime (tsconfig `jsx: react-jsx`), so React need not be in scope.
    ...react.configs.flat['jsx-runtime'],
    files: ['src/client/**/*.{ts,tsx}'],
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // A stale dep array is a real bug, not a style nit.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Prettier owns formatting — turn off every stylistic rule so the two never fight. Must stay last.
  prettier,
);

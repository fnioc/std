// @ts-check
import tseslint from 'typescript-eslint';

import rhombusInline from './scripts/eslint/rhombus-inline.mjs';

export default tseslint.config(
  {
    // Source: full type-aware rule set
    files: ['libraries/*/src/**/*.ts', 'examples/*/src/**/*.ts'],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/strict-boolean-expressions': ['error', {
        allowNullableBoolean: true,
        allowNullableString: true,
        allowNullableNumber: true,
      }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
    },
  },
  {
    // Inline-sugar authoring files: the hygiene the generic inline stage relies
    // on (single return expression over compile-time primitives). Rides the
    // type-aware block's parser settings; the rule itself uses none.
    files: ['libraries/*/src/inline.ts'],
    plugins: { 'rhombus-inline': rhombusInline },
    rules: { 'rhombus-inline/inline-authoring': 'error' },
  },
  {
    // Tests: not in any tsconfig → syntactic rules only (no type info, no parsing error)
    files: ['libraries/*/test/**/*.ts', 'examples/*/test/**/*.ts', 'tests/*.test/test/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
    },
  },
);

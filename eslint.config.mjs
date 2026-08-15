// @ts-check
import tseslint from 'typescript-eslint';

import rhombusInline from './scripts/eslint/rhombus-inline.mjs';

export default tseslint.config({
  // Source: full type-aware rule set
  files: ['libraries/*/src/**/*.ts', 'examples/*/src/**/*.ts'],
  extends: [tseslint.configs.base],
  languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  rules: { curly: ['error', 'all'], '@typescript-eslint/switch-exhaustiveness-check': 'error',
    '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
    '@typescript-eslint/no-restricted-imports': ['error', {
      patterns: [{
        group: ['@rhombus-std/*/tokens/**', '@rhombus-std/*/private/**'],
        message: 'White-box seam (tests only) — import from the package barrel instead.',
      }],
    }] },
}, {
  // Inline-sugar authoring files: the hygiene the generic inline stage relies
  // on (single return expression over compile-time primitives). Rides the
  // type-aware block's parser settings; the rule itself uses none. A marker
  // body lives wherever its declaring package puts it — the rule locates it by
  // walking that package's own `rhombus-std` inline publish list, not by file
  // name — so the glob only needs to reach every candidate file; a package's
  // barrel, its `inline.ts`, and its `augmentations/*.ts` are the shapes in use
  // today.
  files: ['libraries/*/src/index.ts', 'libraries/*/src/inline.ts', 'libraries/*/src/augmentations/*.ts'],
  plugins: { 'rhombus-inline': rhombusInline },
  rules: { 'rhombus-inline/inline-authoring': 'error' },
}, {
  // Tests: not in any tsconfig → syntactic rules only (no type info, no parsing error)
  files: ['tests/*.test/test/**/*.ts'],
  extends: [tseslint.configs.base],
  rules: { curly: ['error', 'all'], '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }] },
});

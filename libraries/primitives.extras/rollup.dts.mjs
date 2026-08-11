// Rolls the public type surface of @rhombus-std/primitives.extras into a
// single dist/bundle/index.d.ts — the authoring-only token-grammar predicate
// stubs (isSingular / singularValue, §94). `@rhombus-std/primitives` stays external:
// `typefor` returns a `Type`, and an inlined copy carries its own `unique symbol` brand, so a
// consumer importing both packages finds the two `Type`s mutually unassignable.
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig,
// so extensionless relative specifiers resolve through `moduleResolution: bundler`.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default { input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^@rhombus-std\/primitives$/, /^@rhombus-toolkit\/func$/],
  plugins: [dts({ tsconfig: join(PKG_ROOT, 'tsconfig.json'), respectExternal: true })] };

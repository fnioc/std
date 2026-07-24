// Rolls the public type surface of @rhombus-std/primitives.extras into a
// single dist/bundle/index.d.ts — the authoring-only token-grammar predicate
// stubs (isSingular / singularValue, §94). The per-primitive source files carry
// no external type imports, so the rolled declaration is self-contained.
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig,
// so extensionless relative specifiers resolve through `moduleResolution: bundler`.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

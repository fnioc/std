// Rolls the public type surface of @rhombus-std/caching.core into a single
// dist/bundle/index.d.ts. @rhombus-std/primitives stays EXTERNAL (respectExternal)
// so the published declaration imports IChangeToken from
// @rhombus-std/primitives rather than inlining a private copy.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^@rhombus-std\/primitives$/, /^@rhombus-std\/primitives\.transformer(\/|$)/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

// Rolls the public type surface of @rhombus-std/caching.memory into a single
// dist/bundle/index.d.ts. Every @rhombus-std sibling stays EXTERNAL (respectExternal)
// so the published declaration imports their types rather than inlining
// private copies.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^@rhombus-std\//],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

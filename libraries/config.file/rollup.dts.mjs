// Rolls the public type surface of @rhombus-std/config.file into a single
// dist/bundle/index.d.ts. The workspace peers/deps stay EXTERNAL (respectExternal:
// true) so this package's `declare module` augmentations survive as real
// module augmentations against the published types they extend, rather than
// getting inlined into private copies the consumer never touches.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [
    /^@rhombus-std\/config$/,
    /^@rhombus-std\/config(\/|$)/,
    /^@rhombus-std\/config\.core$/,
    /^@rhombus-std\/fileproviders\.core$/,
    /^@rhombus-std\/fileproviders\.physical$/,
    /^@rhombus-std\/primitives$/,
    /^@rhombus-std\/primitives\.transformer(\/|$)/,
    /^@rhombus-toolkit\/func$/,
  ],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

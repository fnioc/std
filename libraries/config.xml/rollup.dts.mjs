// Rolls the public type surface of @rhombus-std/config.xml into a single
// dist/bundle/index.d.ts. Workspace peers/deps stay EXTERNAL (respectExternal: true)
// so the `declare module` augmentations survive as real module augmentations.

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
    /^@rhombus-std\/config\.file$/,
    /^@rhombus-std\/fileproviders\.core$/,
    /^@rhombus-std\/primitives$/,
    /^@rhombus-std\/primitives\.extras(\/|$)/,
  ],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

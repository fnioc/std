// Rolls the public type surface of @rhombus-std/options.augmentations into a
// single dist/bundle/index.d.ts. The workspace packages stay EXTERNAL
// (respectExternal: true) -- this package's `declare module "@rhombus-std/di.core"`
// augmentation must survive as a real module augmentation against the peer's
// published types, not get inlined into a private copy the consumer never touches.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [
    /^@rhombus-std\/di\.core$/,
    /^@rhombus-std\/options$/,
    /^@rhombus-std\/config\.core$/,
    /^@rhombus-std\/primitives$/,
  ],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

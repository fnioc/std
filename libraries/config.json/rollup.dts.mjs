// Rolls the public type surface of @rhombus-std/config.json into a single
// dist/bundle/index.d.ts. `@rhombus-std/config` stays EXTERNAL (respectExternal: true) --
// this package's `declare module "@rhombus-std/config"` augmentation must survive
// as a real module augmentation against the peer's published types, not get
// inlined into a private copy the consumer never touches.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [
    /^@rhombus-std\/config$/,
    /^@rhombus-std\/config.core$/,
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

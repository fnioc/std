// Rolls the public type surface of @rhombus-std/diagnostics into a single
// dist/bundle/index.d.ts. The workspace packages stay EXTERNAL (respectExternal: true)
// so this package's `declare module "@rhombus-std/di.core"` augmentation survives
// as a real module augmentation against the peer's published types rather than
// being inlined into a private copy the consumer never touches.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [
    /^@rhombus-std\/config\.core$/,
    /^@rhombus-std\/di\.core$/,
    /^@rhombus-std\/config$/,
    /^@rhombus-std\/options$/,
    /^@rhombus-std\/options\.augmentations$/,
    /^@rhombus-std\/diagnostics\.core$/,
    /^@rhombus-std\/primitives$/,
    /^@rhombus-std\/primitives\.extras(\/|$)/,
    /^@rhombus-toolkit\/func$/,
  ],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

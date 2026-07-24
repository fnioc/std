// Rolls the public type surface of @rhombus-std/config.env into a single
// dist/bundle/index.d.ts. @rhombus-std/config stays external (a peer dep -- consumers have
// it, and the augmentation depends on it being the SAME ConfigBuilder
// class, not an inlined copy). rollup-plugin-dts drives the TypeScript
// compiler with this package's tsconfig, so extensionless relative specifiers
// resolve through `moduleResolution: bundler`.

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

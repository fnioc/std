// Rolls the public type surface of @rhombus-std/di.extras.options into a
// single dist/bundle/index.d.ts. `typescript` and the sibling @rhombus-std packages stay
// EXTERNAL (respectExternal: true) -- they are peer dependencies a consumer
// already has, not something to inline into the declaration output.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^typescript$/, /^@rhombus-std\//],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

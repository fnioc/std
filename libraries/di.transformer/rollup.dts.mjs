// Rolls the public type surface of @rhombus-std/di.transformer into a single
// dist/index.d.ts. `typescript` stays external (a peer dep — consumers have it).
// The transformer's own source carries no @rhombus-std/di.core runtime import; this guards
// the type surface against one leaking in.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'index.d.ts'), format: 'es' },
  external: [/^typescript$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

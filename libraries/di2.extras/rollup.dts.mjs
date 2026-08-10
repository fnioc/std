// Rolls the public type surface of @rhombus-std/di2.extras into a single
// dist/bundle/index.d.ts. `typescript` stays external (a peer dep — consumers have it),
// and so does @rhombus-std/di2.core: the primitives here return its types, and an inlined
// copy would bind them to a fork that no di2.core value satisfies.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default { input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^typescript$/, /^@rhombus-std\/di2\.core$/, /^@rhombus-std\/primitives$/,
    /^@rhombus-std\/primitives\.extras(\/|$)/, /^@rhombus-toolkit\/func$/],
  plugins: [dts({ tsconfig: join(PKG_ROOT, 'tsconfig.json'), respectExternal: true })] };

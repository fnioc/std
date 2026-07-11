// Rolls the public type surface of @rhombus-std/logging.core into a single
// dist/index.d.ts. @rhombus-std/di.core and @rhombus-std/primitives stay
// EXTERNAL (respectExternal) so the published declaration imports their types
// rather than inlining private copies; @rhombus-toolkit/func is inlined.
// @rhombus-std/primitives.transformer is external too -- its `nameof` import is
// value-only (lowered out of the JS emit) and contributes nothing to the types.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'index.d.ts'), format: 'es' },
  external: [/^@rhombus-std\/di\.core$/, /^@rhombus-std\/primitives$/, /^@rhombus-std\/primitives\.transformer(\/|$)/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

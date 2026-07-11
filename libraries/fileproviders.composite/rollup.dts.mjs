// Rolls the public type surface of @rhombus-std/fileproviders.composite into a
// single dist/index.d.ts. Both @rhombus-std/fileproviders.core and
// @rhombus-std/primitives stay EXTERNAL (respectExternal) so the published
// declaration imports their types rather than inlining private copies.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'index.d.ts'), format: 'es' },
  external: [/^@rhombus-std\/fileproviders\.core$/, /^@rhombus-std\/primitives$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

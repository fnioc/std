// Rolls the Tier 2 opt-in seam (src/with-type-augment.ts) into a standalone
// dist/bundle/with-type-augment.d.ts. This module is NOT reachable from the barrel, so
// it needs its own roll -- otherwise the `withType` declaration would never
// reach a published consumer who imports "@rhombus-std/config/with-type-augment".
//
// Both @rhombus-std/config.core and the package barrel "@rhombus-std/config"
// stay EXTERNAL (respectExternal), so the emitted `declare module
// "@rhombus-std/config"` augmentation is preserved verbatim (never rewritten to a
// self-referential module) and merges onto the consumer's real ConfigBuilder.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'with-type-augment.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'with-type-augment.d.ts'), format: 'es' },
  external: [/^@rhombus-std\/config$/, /^@rhombus-std\/config\.core$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

// Rolls the public type surface of @rhombus-std/hosting into a single
// dist/bundle/index.d.ts. Every @rhombus-std/* workspace package (and @rhombus-toolkit/*)
// is kept EXTERNAL -- the output re-exports their interfaces FROM them rather
// than inlining. This is load-bearing for the declaration-merging augmentations
// (`@rhombus-std/di.core`'s ServiceManifest, `@rhombus-std/config`'s
// ConfigBuilder, `@rhombus-std/hosting.core`'s addHostedService): the
// types a consumer holds must carry the declaring module's identity for the
// merges to attach. Inlining would fork that identity.
//
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig,
// so bundler `.ts` specifiers resolve to the `.ts` sources through the workspace.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  // Preserve every workspace package as an external import so its module
  // identity (the augmentation target) survives into the published declaration.
  external: [/^@rhombus-std\//, /^@rhombus-toolkit\//],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

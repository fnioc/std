// Rolls the public type surface of @rhombus-std/options into a single
// dist/bundle/index.d.ts. @rhombus-std/primitives stays EXTERNAL (respectExternal)
// so the published declaration imports ChangeTokenProducer from
// @rhombus-std/primitives rather than inlining a private copy.
//
// @rhombus-std/di.core is external for a STRONGER reason than tidiness: inlining
// it copies di.core's own `declare module "@rhombus-std/di.core"` self-augmentation
// (the `removeAll`/`tryAdd*`/`replace*` descriptor verbs) into this bundle, and the
// copy's return types bind to the INLINED `IServiceManifestBase`, not the real one.
// A consumer that loads both then sees two forked manifest interfaces: `manifest`
// carries every cross-package augmentation while `manifest.removeAll(...)`'s result
// carries none, so `services = services.removeAll(t)` fails to typecheck. Keeping
// di.core external is what makes the descriptor verbs chainable downstream.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^@rhombus-std\/di\.core$/, /^@rhombus-std\/primitives$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

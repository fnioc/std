// Rolls the public type surface of @rhombus-std/di into a single dist/bundle/index.d.ts.
// @rhombus-std/di.core is kept EXTERNAL — the output re-exports the abstraction
// interfaces (`IResolver`, `IServiceProvider`, `AddBuilder`, `IServiceManifestBase`,
// …) FROM `@rhombus-std/di.core` rather than inlining them. This is load-bearing:
// `@rhombus-std/di.transformer` augments `declare module "@rhombus-std/di.core"`, so
// the interfaces a consumer holds must carry the `@rhombus-std/di.core` module
// identity for the tokenless authoring forms (`resolve<T>()`, `add<I>()`) to
// merge onto them. Inlining core would fork that identity and the augmentation
// would attach to nothing. The @rhombus-toolkit type-only deps stay inlined.
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig,
// so NodeNext `.js` specifiers resolve to the `.ts` sources through the workspace.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  // Preserve `@rhombus-std/di.core` as an external import so its module identity
  // (the augmentation target) survives into the published declaration.
  external: [/^@rhombus-std\/di\.core$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

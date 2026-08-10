// Rolls the public type surface of @rhombus-std/di2 into a single dist/bundle/index.d.ts.
// @rhombus-std/di2.core is kept EXTERNAL — the output re-exports the abstraction
// interfaces (`IResolver`, `IServiceProvider`, `AddChain`, `IServiceManifestBase`,
// …) FROM `@rhombus-std/di2.core` rather than inlining them. This is load-bearing:
// an authoring package augments `declare module "@rhombus-std/di2.core"`, so
// the interfaces a consumer holds must carry the `@rhombus-std/di2.core` module
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
  // Preserve `@rhombus-std/di2.core` as an external import so its module identity
  // (the augmentation target) survives into the published declaration, and
  // `@rhombus-std/primitives` so `Type` keeps ONE identity across the graph — an inlined copy
  // carries its own `unique symbol` brand, which no other copy's node can satisfy, so a consumer
  // importing both packages finds their `Type`s mutually unassignable.
  external: [/^@rhombus-std\/di2\.core$/, /^@rhombus-std\/primitives$/],
  plugins: [dts({ tsconfig: join(PKG_ROOT, 'tsconfig.json'), respectExternal: true })],
};

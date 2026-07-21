// Rolls the public type surface of @rhombus-std/di.transformer into a single
// dist/bundle/index.d.ts. `typescript` stays external (a peer dep — consumers have it).
// The transformer's own source carries no @rhombus-std/di.core runtime import; this guards
// the type surface against one leaking in.
//
// @rhombus-std/di.core (a peer dep) is external too, and that is LOAD-BEARING, not
// cosmetic. This package's whole job is a `declare module "@rhombus-std/di.core"`
// augmentation whose members RETURN di.core types (`AddChain`, `IServiceManifest`).
// Inlining di.core copies those types into this bundle, and the augmentation's return
// types then bind to the COPIES: the members still merge onto the real interfaces, but
// `add<I>(C)` hands back a forked `AddChain` that carries neither the descriptor verbs
// nor this file's own `as<Scope>()` merge — so `services = services.add<I>(C)` fails to
// assign and `.as<"singleton">()` reports "Expected 0 type arguments". Keep it external
// (§106).

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  external: [/^typescript$/, /^@rhombus-std\/di\.core$/, /^@rhombus-std\/primitives$/,
    /^@rhombus-std\/primitives\.transformer(\/|$)/, /^@rhombus-toolkit\/func$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

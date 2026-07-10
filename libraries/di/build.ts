// Build @rhombus-std/di for publication.
//
// Two outputs. @rhombus-std/di.core now ships RUNTIME (the slot/token helpers,
// the registration builder, the registration errors). It is kept EXTERNAL from
// di's JS bundle — NOT inlined — so the concrete `ServiceManifestClass` has ONE
// runtime identity: di prototype-patches `build()` onto that class and
// cross-package augmentations patch it too, so a private inlined copy would fork
// the identity and break both. (Same reason di.core stays external in the .d.ts.)
// @rhombus-std/primitives is external for the same reason: di registers its
// `build()` augmentation through primitives' registry, and inlining primitives
// would fork the registry singleton (§9/§38).
//
//   1. dist/index.js   — `bun build` bundles the tspc-lowered emit (di registers
//      its `build()` augmentation against `nameof<ServiceManifest>()`, so the
//      lowering stage must run before bundling); `assertNever` is a local
//      2-liner; @rhombus-toolkit/func is type-only and erases.
//   2. dist/index.d.ts — rollup-plugin-dts rolls di's own public types into one
//      declaration file, re-exporting @rhombus-std/di.core's types FROM di.core
//      (external, for the augmentation module identity); the type-only
//      @rhombus-toolkit types stay inlined.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/di",
  external: ["@rhombus-std/di.core", "@rhombus-std/primitives"],
  tspcProject: "tsconfig.build.json",
});

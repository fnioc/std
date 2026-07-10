// Build @rhombus-std/di.core for publication.
//
// di.core now ships RUNTIME: the slot/token helpers, the registration builder
// (`ServiceManifestClass`, `@augment`-decorated for the `ServiceManifest` token),
// the descriptor augmentation (`removeAll`), and the registration-time errors. Two
// outputs:
//
//   1. dist/index.js   — `bun build` bundles the ESM entry with
//      @rhombus-std/primitives EXTERNAL. primitives owns the augmentation
//      registry's Map + notify bus; inlining a private copy would fork that
//      singleton and split the registry (runtime-identity invariant §9/§38), so a
//      class decorated against one copy never sees augmentations registered against
//      the other. The only other import is the type-only @rhombus-toolkit/func (it
//      erases).
//   2. dist/index.d.ts — rollup-plugin-dts rolls the public type surface into one
//      declaration file, inlining the type-only @rhombus-toolkit types.
//
// @rhombus-std/di keeps di.core EXTERNAL (not inlined) in its own bundle so the
// concrete `ServiceManifestClass` has ONE runtime identity — the class whose
// prototype di's `build()` augmentation and every cross-package augmentation reach
// must be the same object.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/di.core",
  external: ["@rhombus-std/primitives"],
  tspcProject: "tsconfig.build.json",
});

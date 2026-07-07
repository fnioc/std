// Build @rhombus-std/di.core for publication.
//
// di.core now ships RUNTIME: the slot/token helpers, the registration builder
// (`ServiceManifestClass`), and the registration-time errors. Two outputs:
//
//   1. dist/index.js   — `bun build` bundles the ESM entry. The only import is
//      the type-only @rhombus-toolkit/func (it erases), so nothing is
//      externalized and the bundle carries zero dependencies.
//   2. dist/index.d.ts — rollup-plugin-dts rolls the public type surface into one
//      declaration file, inlining the type-only @rhombus-toolkit types so the
//      published declaration has no external import.
//
// @rhombus-std/di keeps di.core EXTERNAL (not inlined) in its own bundle so the
// concrete `ServiceManifestClass` has ONE runtime identity — the class di
// prototype-patches `build()` onto, and the class cross-package augmentations
// patch, must be the same object.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/di.core",
});

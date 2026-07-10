// Build @rhombus-std/caching.core for publication.
//
// caching.core ships REAL runtime (the get/set/getOrCreate convenience
// wrappers), so it emits a JS bundle like @rhombus-std/options -- not a
// types-only core. @rhombus-std/primitives stays EXTERNAL: a consumer's own
// CancellationChangeToken must keep the same IChangeToken identity this
// package was built against.
//
// PILOT: this package's `nameof<T>()` lowering runs on the ttsc/Go engine
// (`ttscProject`) rather than tspc/ts-patch (`tsconfig.build.json` is the
// retained tspc twin). The lowered JS is identical either way; the typecheck
// (`tsc --noEmit`) and lint gates stay on plain typescript 5.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/caching.core",
  external: ["@rhombus-std/primitives"],
  ttscProject: "tsconfig.ttsc.json",
});

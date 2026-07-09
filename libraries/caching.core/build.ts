// Build @rhombus-std/caching.core for publication.
//
// caching.core ships REAL runtime (the get/set/getOrCreate convenience
// wrappers), so it emits a JS bundle like @rhombus-std/options -- not a
// types-only core. @rhombus-std/primitives stays EXTERNAL: a consumer's own
// CancellationChangeToken must keep the same IChangeToken identity this
// package was built against.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/caching.core",
  external: ["@rhombus-std/primitives"],
  tspcProject: "tsconfig.build.json",
});

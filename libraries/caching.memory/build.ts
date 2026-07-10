// Build @rhombus-std/caching.memory for publication.
//
// Every @rhombus-std sibling stays EXTERNAL. @rhombus-std/di.core especially:
// the addMemoryCache augmentation prototype-patches the CONSUMER's
// ServiceManifestClass, so a private inlined copy would patch the wrong class
// (same reasoning as @rhombus-std/config.json's ConfigurationBuilder patch).
// The others (caching.core/logging.core/options/primitives) carry runtime
// identity (IChangeToken, the Options accessor) that a private copy would fork.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/caching.memory",
  external: [
    "@rhombus-std/caching.core",
    "@rhombus-std/di.core",
    "@rhombus-std/logging.core",
    "@rhombus-std/options",
    "@rhombus-std/primitives",
  ],
  tspcProject: "tsconfig.build.json",
});

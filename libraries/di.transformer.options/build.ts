// Build @rhombus-std/di.transformer.options for publication.
//
// The transformer runs at COMPILE time inside ts-patch. `typescript` is a peer
// dep (ts-patch supplies the same instance) and stays external.
// `@rhombus-std/primitives.transformer` supplies the token machinery and stays
// external — its derivation functions are pure, but keeping it external avoids a
// second bundled copy and shares one instance with di.transformer — and
// `@rhombus-std/di.core` is types-only (erased). Both external.
//
// The satellite never imports the `@rhombus-std/di` RUNTIME; the only cross-package
// runtime import is `@rhombus-std/primitives.transformer`'s token machinery.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/di.transformer.options",
  external: [
    "typescript",
    "@rhombus-std/primitives.transformer",
    "@rhombus-std/di.core",
  ],
});

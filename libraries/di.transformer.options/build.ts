// Build @rhombus-std/di.transformer.options for publication.
//
// The transformer runs at COMPILE time inside ts-patch. `typescript` is a peer
// dep (ts-patch supplies the same instance) and stays external. `@rhombus-std/di.transformer`
// is a peer dep too — the satellite shares the consumer's ONE di.transformer
// instance (its token machinery is pure, but keeping it external avoids a second
// bundled copy) — and `@rhombus-std/di.core` is types-only (erased). Both external.
//
// The satellite never imports the `@rhombus-std/di` RUNTIME; the only cross-package
// runtime import is `@rhombus-std/di.transformer`'s token machinery.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/di.transformer.options",
  external: [
    "typescript",
    "@rhombus-std/di.transformer",
    "@rhombus-std/di.core",
  ],
});

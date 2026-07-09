// Build @rhombus-std/diagnostics.core for publication.
//
// @rhombus-std/di.core and @rhombus-std/options stay EXTERNAL: this package uses
// them only for types (`ServiceManifestBase`/`Token`/`DepSlot`/`Ctor` and
// `ConfigureOptions`), which erase at runtime -- keeping them external leaves the
// published .d.ts importing the real peer types rather than inlining a private
// copy. @rhombus-toolkit/func is likewise a types-only import (`Func`).
// @rhombus-std/primitives is a RUNTIME import (registerAugmentations) and must
// stay external -- an inlined copy would fork the augmentation registry's
// Map + event bus (docs §38).

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/diagnostics.core",
  external: [
    "@rhombus-std/di.core",
    "@rhombus-std/options",
    "@rhombus-std/primitives",
    "@rhombus-toolkit/func",
  ],
});

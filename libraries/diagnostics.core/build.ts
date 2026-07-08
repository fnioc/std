// Build @rhombus-std/diagnostics.core for publication.
//
// @rhombus-std/di.core and @rhombus-std/options stay EXTERNAL: this package uses
// them only for types (`ServiceManifestBase`/`Token`/`DepSlot`/`Ctor` and
// `ConfigureOptions`), which erase at runtime -- keeping them external leaves the
// published .d.ts importing the real peer types rather than inlining a private
// copy. @rhombus-toolkit/func is likewise a types-only import (`Func`).

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/diagnostics.core",
  external: [
    "@rhombus-std/di.core",
    "@rhombus-std/options",
    "@rhombus-toolkit/func",
  ],
});

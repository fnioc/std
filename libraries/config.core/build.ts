// Build @rhombus-std/config.core for publication.
//
// core WAS a pure-types package; the augmentation-registry migration (docs §38)
// gave it one runtime export -- CONFIGURATION_BUILDER_AUGMENTATION_TOKEN, the
// registry token for the OPEN IConfigurationBuilder receiver -- so it now emits
// a (tiny) dist/index.js alongside the rolled dist/index.d.ts.
//
// @rhombus-std/primitives stays EXTERNAL: it is used only for the `Token` type
// here, but the repo-wide rule (docs §38) is that NO bundle may inline
// primitives -- an inlined copy would fork the registry's Map + event bus.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/config.core",
  external: ["@rhombus-std/primitives"],
});

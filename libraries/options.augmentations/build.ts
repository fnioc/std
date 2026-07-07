// Build @rhombus-std/options.augmentations for publication.
//
// @rhombus-std/di.core stays EXTERNAL: the addOptions/configure augmentation
// patches the CONSUMER's ServiceManifestClass.prototype, so a private inlined
// copy would leave the sugar installed on a class the consumer never touches.
// The runtime dependency @rhombus-std/options is external too so a consumer
// shares one Options/OptionsFactory identity with the value this package builds
// against; config.core and primitives are types-only (erased), external for
// parity.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/options.augmentations",
  external: [
    "@rhombus-std/di.core",
    "@rhombus-std/options",
    "@rhombus-std/config.core",
    "@rhombus-std/primitives",
  ],
});

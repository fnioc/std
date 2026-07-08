// Build @rhombus-std/config.env for publication.
//
// @rhombus-std/config stays EXTERNAL: this package patches
// ConfigurationBuilder.prototype from @rhombus-std/config, so a consumer's copy of
// @rhombus-std/config must be the same instance the augmentation runs against.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/config.env",
  external: ["@rhombus-std/config", "@rhombus-std/config.core", "@rhombus-std/primitives"],
});

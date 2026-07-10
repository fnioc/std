// Build @rhombus-std/config.json for publication.
//
// @rhombus-std/config stays EXTERNAL: the addJsonFile augmentation patches the
// CONSUMER's ConfigurationBuilder.prototype, so a private inlined copy would
// leave the sugar method installed on a class the consumer never touches.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/config.json",
  external: ["@rhombus-std/config", "@rhombus-std/config.core", "@rhombus-std/primitives"],
  tspcProject: "tsconfig.build.json",
});

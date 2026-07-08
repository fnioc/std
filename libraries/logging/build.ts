// Build @rhombus-std/logging for publication.
//
// @rhombus-std/di.core stays EXTERNAL: `addLogging` patches the CONSUMER's
// ServiceManifestClass.prototype, so a private inlined copy would install the
// sugar on a class the consumer never touches (the config.json rationale).
// @rhombus-std/logging.core is external too — logging consumes only its types,
// and its runtime (the log* wrappers) belongs to the consumer's own copy.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/logging",
  external: ["@rhombus-std/di.core", "@rhombus-std/logging.core", "@rhombus-std/primitives"],
});

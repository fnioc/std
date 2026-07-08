// Build @rhombus-std/logging.configuration for publication.
//
// The @rhombus-std sibling packages stay EXTERNAL — most are consumed as types,
// and @rhombus-std/logging's LoggerFilterOptions must keep the consumer's own
// runtime identity rather than a private inlined copy.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/logging.configuration",
  external: [
    "@rhombus-std/config",
    "@rhombus-std/config.core",
    "@rhombus-std/di.core",
    "@rhombus-std/logging",
    "@rhombus-std/logging.core",
    "@rhombus-std/options",
    "@rhombus-std/primitives",
  ],
});

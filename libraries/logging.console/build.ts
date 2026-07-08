// Build @rhombus-std/logging.console for publication.
//
// @rhombus-std/logging.core stays EXTERNAL: it carries runtime identity
// (LogLevel, EventId) that a private inlined copy would fork — a consumer's
// LogLevel enum must be the same object the provider compares against.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/logging.console",
  external: [
    "@rhombus-std/logging.core",
  ],
});

// Build @rhombus-std/logging.console for publication.
//
// @rhombus-std/logging.core stays EXTERNAL: it carries runtime identity
// (LogLevel, EventId) that a private inlined copy would fork — a consumer's
// LogLevel enum must be the same object the provider compares against.
// @rhombus-std/logging (addConsole routes through LoggingBuilderExtensions
// .addProvider) and @rhombus-std/primitives (the augmentation registry's Map +
// event bus) stay external for the same single-runtime-identity reason (docs
// §38).

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/logging.console",
  external: [
    "@rhombus-std/logging",
    "@rhombus-std/logging.core",
    "@rhombus-std/primitives",
  ],
});

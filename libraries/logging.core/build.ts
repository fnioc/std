// Build @rhombus-std/logging.core for publication.
//
// @rhombus-std/di.core stays EXTERNAL: `ILoggingBuilder.services` is typed as
// di.core's `ServiceManifest`, and the published declaration should import that
// type from di.core rather than inlining a private copy that would drift from
// the real registration builder. @rhombus-std/primitives stays EXTERNAL for
// runtime identity (§9/§38): `LoggerExtensions` self-registers with the
// augmentation registry, and an inlined private copy would fork the registry's
// Map + bus. (`@rhombus-toolkit/func` is a type-only dev dependency and is
// inlined into the rolled .d.ts, mirroring di.core.)
//
// The JS emit runs through the tspc lowering stage (tsconfig.build.json) so the
// inline `nameof<ILogger>()` token ships as its derived string literal.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/logging.core",
  external: ["@rhombus-std/di.core", "@rhombus-std/primitives"],
  tspcProject: "tsconfig.build.json",
});

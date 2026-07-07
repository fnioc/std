// Build @rhombus-std/logging.core for publication.
//
// @rhombus-std/di.core stays EXTERNAL: `ILoggingBuilder.services` is typed as
// di.core's `ServiceManifest`, and the published declaration should import that
// type from di.core rather than inlining a private copy that would drift from
// the real registration builder. (`@rhombus-toolkit/func` is a type-only dev
// dependency and is inlined into the rolled .d.ts, mirroring di.core.)

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/logging.core",
  external: ["@rhombus-std/di.core"],
});

// Build @rhombus-std/diagnostics for publication.
//
// Every workspace/toolkit dependency stays EXTERNAL. @rhombus-std/di.core is a
// peer whose ServiceManifestClass this package prototype-patches (addMetrics/
// addTracing), so a private inlined copy would leave the sugar on a class the
// consumer never touches -- exactly the reason @rhombus-std/config.json and
// options.augmentations keep their peer external. @rhombus-std/options,
// diagnostics.core and primitives are kept external so the consumer shares one
// Options / MetricsOptions / IChangeToken identity with the values this package
// builds; config and options.augmentations are erased types plus an external
// runtime dependency (ConfigurationChangeTokenSource).

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/diagnostics",
  external: [
    "@rhombus-std/di.core",
    "@rhombus-std/config",
    "@rhombus-std/options",
    "@rhombus-std/options.augmentations",
    "@rhombus-std/diagnostics.core",
    "@rhombus-std/primitives",
    "@rhombus-toolkit/func",
  ],
});

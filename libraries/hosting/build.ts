// Build @rhombus-std/hosting for publication -- mirrors libraries/di.
//
// Every @rhombus-std/* workspace dependency (and @rhombus-toolkit/*) is kept
// EXTERNAL from the JS bundle -- NOT inlined -- so the cross-package
// prototype-patched classes (`ServiceManifestClass`, `ConfigurationBuilder`)
// keep ONE runtime identity: hosting registers through di's patched
// `ServiceManifest.build()`, the config providers patch `ConfigurationBuilder`,
// and a private inlined copy would fork those identities. primitives stays
// external for the same reason -- the augmentation registry is a shared
// singleton (§38). (Same reason they stay external in the .d.ts.)
//
// The JS emit runs through the tspc lowering stage (tsconfig.build.json) so the
// inline `nameof<IHost>()` / `nameof<IHostBuilder>()` / `nameof<IHostEnvironment>()`
// / `nameof<IMetricsBuilder>()` augmentation tokens ship as their derived string
// literals; `Bun.build` alone never runs ts-patch transformers. The lowering
// engine lives in exactly one place -- `buildPackage`'s `tspcProject` hook -- so
// a later tspc-engine swap touches only scripts/build-package.ts.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/hosting",
  external: ["@rhombus-std/*", "@rhombus-toolkit/*"],
  tspcProject: "tsconfig.build.json",
});

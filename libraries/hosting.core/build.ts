// Build @rhombus-std/hosting.core for publication.
//
// Every @rhombus-std/* workspace dependency (and @rhombus-toolkit/*) is kept
// EXTERNAL from the JS bundle -- NOT inlined -- so the cross-package
// prototype-patched classes (`ServiceManifestClass`) keep ONE runtime identity:
// `hosted-service-augmentations.ts` registers onto di.core's `ServiceManifestClass`,
// and a private inlined copy would install `addHostedService` on a class no
// consumer ever touches (mirrors libraries/hosting/build.ts and
// libraries/logging/build.ts's identical rationale). primitives stays external
// for the same reason -- the augmentation registry is a shared singleton (§38).
//
// The JS emit runs through the tspc lowering stage (tsconfig.build.json) so the
// inline `nameof<IHost>()` / `nameof<IHostBuilder>()` / `nameof<IHostEnvironment>()`
// augmentation tokens ship as their derived string literals; `Bun.build` alone
// never runs ts-patch transformers. The lowering engine lives in exactly one
// place -- `buildPackage`'s `tspcProject` hook -- so a later tspc-engine swap
// touches only scripts/build-package.ts.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/hosting.core",
  external: ["@rhombus-std/*", "@rhombus-toolkit/*"],
  tspcProject: "tsconfig.build.json",
});

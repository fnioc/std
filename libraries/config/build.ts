// Build @rhombus-std/config for publication.
//
// Two JS entrypoints, two rolled .d.ts files:
//
//   - src/index.ts            -> dist/index.js / dist/index.d.ts (the barrel).
//   - src/with-type-augment.ts -> dist/with-type-augment.js /
//     dist/with-type-augment.d.ts (the opt-in Tier 2 seam, NOT reachable from
//     the barrel -- so it needs its own entrypoint or the `withType` prototype
//     patch would never land in the published artifact).
//
// @rhombus-std/config.core stays external (it now carries the runtime
// augmentation token); @rhombus-std/primitives stays external because an
// inlined copy would fork the augmentation registry's Map + event bus (docs
// §38). @rhombus-toolkit/proxy-base is deliberately NOT external, so bun
// inlines it (its published ESM uses extensionless relative imports that
// Node's ESM resolver rejects -- bundling resolves them).

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/config",
  entrypoints: ["src/index.ts", "src/with-type-augment.ts"],
  external: ["@rhombus-std/config.core", "@rhombus-std/primitives"],
  dtsConfigs: ["rollup.dts.mjs", "rollup.with-type-augment.dts.mjs"],
});

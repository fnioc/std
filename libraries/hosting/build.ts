// Build @rhombus-std/hosting for publication -- mirrors libraries/di.
//
// Two outputs. Every @rhombus-std/* workspace dependency (and @rhombus-toolkit/*)
// is kept EXTERNAL from the JS bundle -- NOT inlined -- so the cross-package
// prototype-patched classes (`ServiceManifestClass`, `ConfigurationBuilder`)
// keep ONE runtime identity: hosting registers through di's patched
// `ServiceManifest.build()`, the config providers patch `ConfigurationBuilder`,
// and a private inlined copy would fork those identities. (Same reason they stay
// external in the .d.ts.)
//
//   1. dist/index.js   -- `bun build` bundles the ESM entry with every workspace
//      package external (re-imported at runtime).
//   2. dist/index.d.ts -- rollup-plugin-dts rolls hosting's own public types into
//      one declaration file, re-exporting the external packages' types FROM them
//      (external, for the augmentation module identity).

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const PKG_ROOT = import.meta.dir;
const DIST = join(PKG_ROOT, "dist");
const ENTRY = join(PKG_ROOT, "src", "index.ts");

rmSync(DIST, { recursive: true, force: true });

// 1. JS bundle -- workspace packages EXTERNAL (shared runtime identity), ESM,
//    node target.
const js = await Bun.build({
  entrypoints: [ENTRY],
  outdir: DIST,
  target: "node",
  format: "esm",
  external: ["@rhombus-std/*", "@rhombus-toolkit/*"],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error("@rhombus-std/hosting: bun build failed");
}

// 2. Rolled-up .d.ts -- workspace types re-exported from their external packages.
const dts = spawnSync(
  "bun",
  ["x", "rollup", "-c", join(PKG_ROOT, "rollup.dts.mjs")],
  { cwd: PKG_ROOT, stdio: "inherit" },
);
if (dts.status !== 0) {
  throw new Error("@rhombus-std/hosting: rollup d.ts bundling failed");
}

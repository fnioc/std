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
import { renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const PKG_ROOT = import.meta.dir;
const DIST = join(PKG_ROOT, "dist");
const STAGE = join(PKG_ROOT, ".tspc-out");
const STAGE_ENTRY = join(STAGE, "index.js");

rmSync(DIST, { recursive: true, force: true });
rmSync(STAGE, { recursive: true, force: true });

// The tspc lowering stage: the inline `nameof<IHost>()` / `nameof<IHostBuilder>()`
// / `nameof<IHostEnvironment>()` / `nameof<IMetricsBuilder>()` augmentation tokens
// must ship as their derived string literals, and `Bun.build` alone never runs
// ts-patch transformers. So `tspc -p tsconfig.build.json` emits transformer-lowered
// per-file JS into .tspc-out/, and the JS bundle below is built from THAT emit.
const emit = spawnSync(
  "bun",
  ["x", "tspc", "-p", join(PKG_ROOT, "tsconfig.build.json")],
  { cwd: PKG_ROOT, stdio: "inherit" },
);
if (emit.status !== 0) {
  throw new Error("@rhombus-std/hosting: tspc lowering emit failed");
}

// 1. JS bundle -- workspace packages EXTERNAL (shared runtime identity), ESM,
//    node target. Bundled from the tspc-lowered stage, not raw src.
const js = await Bun.build({
  entrypoints: [STAGE_ENTRY],
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

// Keep the per-file lowered emit as the white-box (`internal/*`) runtime
// surface: the `internal/*` export's `bun` condition points at dist/internal so
// sibling test packages execute lowered JS instead of raw src (whose un-lowered
// `nameof<T>()` throws at import time). Publish-excluded via `"!dist/internal"`
// in package.json `files`.
renameSync(STAGE, join(DIST, "internal"));

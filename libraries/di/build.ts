// Build @rhombus-std/di for publication.
//
// Two outputs. @rhombus-std/di.core now ships RUNTIME (the slot/token helpers,
// the registration builder, the registration errors). It is kept EXTERNAL from
// di's JS bundle — NOT inlined — so the concrete `ServiceManifestClass` has ONE
// runtime identity: di prototype-patches `build()` onto that class and
// cross-package augmentations patch it too, so a private inlined copy would fork
// the identity and break both. (Same reason di.core stays external in the .d.ts.)
//
//   1. dist/index.js   — `bun build` bundles the ESM entry with @rhombus-std/di.core
//      external (re-imported at runtime); `assertNever` is a local 2-liner;
//      @rhombus-toolkit/func is type-only and erases.
//   2. dist/index.d.ts — rollup-plugin-dts rolls di's own public types into one
//      declaration file, re-exporting @rhombus-std/di.core's types FROM di.core
//      (external, for the augmentation module identity); the type-only
//      @rhombus-toolkit types stay inlined.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const PKG_ROOT = import.meta.dir;
const DIST = join(PKG_ROOT, "dist");
const ENTRY = join(PKG_ROOT, "src", "index.ts");

rmSync(DIST, { recursive: true, force: true });

// 1. JS bundle — @rhombus-std/di.core EXTERNAL (shared runtime identity), ESM,
//    node target. The only local runtime helper (`assertNever`) is inlined.
const js = await Bun.build({
  entrypoints: [ENTRY],
  outdir: DIST,
  target: "node",
  format: "esm",
  external: ["@rhombus-std/di.core"],
});
if (!js.success) {
  for (const log of js.logs) { console.error(log); }
  throw new Error("@rhombus-std/di: bun build failed");
}

// 2. Rolled-up .d.ts — core's types inlined into one file, no @rhombus-std/di.core import.
const dts = spawnSync(
  "bun",
  ["x", "rollup", "-c", join(PKG_ROOT, "rollup.dts.mjs")],
  { cwd: PKG_ROOT, stdio: "inherit" },
);
if (dts.status !== 0) {
  throw new Error("@rhombus-std/di: rollup d.ts bundling failed");
}

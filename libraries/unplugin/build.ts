// Build @rhombus-std/unplugin for publication.
//
//   1. dist/index.js   — `bun build`, ESM, node target.
//   2. dist/index.d.ts — rollup-plugin-dts rollup.
//
// EXTERNAL from the JS bundle: every `@rhombus-std/*` workspace transformer,
// `typescript`, and `unplugin`. The @rhombus-std externals are load-bearing —
// `@rhombus-std/primitives` (transitively, via the transformer packages) owns
// the augmentation registry's Map + event bus, and an inlined copy would fork
// that identity (docs/decisions.md §9/§38). `typescript` is a peer dep the
// consumer already has; `unplugin` is a plain third-party runtime dep.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const PKG_ROOT = import.meta.dir;
const DIST = join(PKG_ROOT, "dist");
const ENTRY = join(PKG_ROOT, "src", "index.ts");

rmSync(DIST, { recursive: true, force: true });

const js = await Bun.build({
  entrypoints: [ENTRY],
  outdir: DIST,
  target: "node",
  format: "esm",
  external: ["@rhombus-std/*", "@rhombus-toolkit/*", "typescript", "unplugin"],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error("@rhombus-std/unplugin: bun build failed");
}

const dts = spawnSync(
  "bun",
  ["x", "rollup", "-c", join(PKG_ROOT, "rollup.dts.mjs")],
  { cwd: PKG_ROOT, stdio: "inherit" },
);
if (dts.status !== 0) {
  throw new Error("@rhombus-std/unplugin: rollup d.ts bundling failed");
}

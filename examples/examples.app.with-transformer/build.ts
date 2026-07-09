// Build the with-transformer app with `Bun.build` + the @rhombus-std unplugin
// host — the production replacement for the old `tspc` emit.
//
// The plugin's Bun adapter runs every @rhombus-std transformer over ONE shared
// `ts.Program` built from THIS app's own `tsconfig.json`, so the tokenless
// authoring forms in `src/main.ts` (`add<I>(C)`, `addOptions<T>()`,
// `resolve<T>()`, …) lower to exactly what a hand-written token user would emit —
// identical in behavior to the tspc output the test's stdout diff still pins.
//
// `packages: "external"` keeps every bare specifier (`@rhombus-std/*`, `node:*`)
// out of the bundle, so `dist/main.js` resolves the workspace packages through
// `node_modules` to their built `dist` at runtime — exactly as the tspc output
// did, and `node dist/main.js` runs it. Only the app's own `src/main.ts` flows
// through the transform.

import { unplugin } from "@rhombus-std/unplugin";
import { join } from "node:path";

const PKG_ROOT = import.meta.dir;

const result = await Bun.build({
  entrypoints: [join(PKG_ROOT, "src", "main.ts")],
  outdir: join(PKG_ROOT, "dist"),
  target: "node",
  format: "esm",
  packages: "external",
  plugins: [unplugin.bun({ tsconfig: join(PKG_ROOT, "tsconfig.json") })],
  throw: false,
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("@rhombus-std/examples.app.with-transformer: bun build failed");
}

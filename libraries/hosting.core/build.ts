import { spawnSync } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import { rollup } from "rollup";
import dts from "rollup-plugin-dts";

await rm("dist", { recursive: true, force: true });
await rm(".tspc-out", { recursive: true, force: true });

// The tspc lowering stage: the inline `nameof<IHost>()` / `nameof<IHostBuilder>()`
// / `nameof<IHostEnvironment>()` augmentation tokens must ship as their derived
// string literals, and `Bun.build` alone never runs ts-patch transformers. So
// `tspc -p tsconfig.build.json` emits transformer-lowered per-file JS into
// .tspc-out/, and the JS bundle below is built from THAT emit rather than raw src.
const emit = spawnSync("bun", ["x", "tspc", "-p", "tsconfig.build.json"], { stdio: "inherit" });
if (emit.status !== 0) {
  throw new Error("@rhombus-std/hosting.core: tspc lowering emit failed");
}

// Every @rhombus-std/* workspace dependency (and @rhombus-toolkit/*) is kept
// EXTERNAL from the JS bundle -- NOT inlined -- so the cross-package
// prototype-patched classes (`ServiceManifestClass`) keep ONE runtime identity:
// `hosted-service-augmentations.ts` registers onto di.core's `ServiceManifestClass`, and
// a private inlined copy would install `addHostedService` on a class no
// consumer ever touches (mirrors libraries/hosting/build.ts and
// libraries/logging/build.ts's identical rationale).
const result = await Bun.build({
  entrypoints: [".tspc-out/index.js"],
  outdir: "dist",
  target: "node",
  format: "esm",
  external: ["@rhombus-std/*", "@rhombus-toolkit/*"],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Emit per-file .d.ts into a scratch dir, then roll them up into a single dist/index.d.ts.
await Bun.$`tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/.types`;

const dtsBundle = await rollup({
  input: "dist/.types/index.d.ts",
  // Keep every workspace package external in the rolled .d.ts (re-exported FROM
  // its declaring module, not inlined) -- same runtime/module-identity rationale
  // as the JS bundle above, and it silences rollup's "could not resolve
  // @rhombus-toolkit/func" resolution warning.
  external: [/^@rhombus-std\//, /^@rhombus-toolkit\//],
  plugins: [dts({ respectExternal: true })],
});
await dtsBundle.write({ file: "dist/index.d.ts", format: "es" });
await dtsBundle.close();

await rm("dist/.types", { recursive: true, force: true });

// Keep the per-file lowered emit as the white-box (`internal/*`) runtime
// surface: the package's `internal/*` export points its `bun` condition at
// dist/internal so sibling test packages execute lowered JS instead of raw src
// (whose un-lowered `nameof<T>()` throws at import time). Publish-excluded via
// `"!dist/internal"` in package.json `files`.
await rename(".tspc-out", "dist/internal");

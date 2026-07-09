// Shared publish-build logic for every @rhombus-std/config* package.
//
// This repo standardized on `moduleResolution: bundler` + extensionless
// relative imports (see /tsconfig.base.json). A plain `tsc` emit would leave
// those specifiers extensionless in dist/, which plain Node ESM cannot
// resolve -- so every published package bundles instead of emitting raw tsc
// output:
//
//   1. dist/*.js    -- `bun build` bundles each ESM entry into a single file
//      with resolved specifiers. `external` keeps peer deps out of the bundle
//      (a provider must patch the CONSUMER's ConfigurationBuilder, not a
//      private inlined copy); anything NOT external is inlined, which is how
//      @rhombus-std/config folds in @rhombus-toolkit/proxy-base (whose published
//      ESM uses extensionless relative imports Node's resolver rejects).
//   2. dist/*.d.ts  -- rollup-plugin-dts rolls the public type surface into one
//      declaration file per configured rollup config.
//
// core is the one exception: it is types-only (emitJs: false) and asserts no
// runtime .js slips into dist.

import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface BuildPackageOptions {
  /** The package root (pass `import.meta.dir`). */
  readonly dir: string;
  /** The package name, for error messages (e.g. `"@rhombus-std/config"`). */
  readonly name: string;
  /** Entrypoints relative to `dir`. Defaults to `["src/index.ts"]`. */
  readonly entrypoints?: readonly string[];
  /** Specifiers kept out of the JS bundle. Defaults to `[]` (bundle everything). */
  readonly external?: readonly string[];
  /** Emit the `bun build` JS bundle. Defaults to `true`; set `false` for types-only core. */
  readonly emitJs?: boolean;
  /** rollup-plugin-dts config files relative to `dir`. Defaults to `["rollup.dts.mjs"]`. */
  readonly dtsConfigs?: readonly string[];
  /** Throw if `dist/index.js` exists after building -- the types-only invariant. */
  readonly assertNoJs?: boolean;
  /**
   * Code-split shared modules into chunks instead of inlining a private copy
   * into each entrypoint. Required when multiple entrypoints must share
   * runtime identity -- e.g. @rhombus-std/config's barrel and its
   * with-type-augment side-effect module both patch the SAME
   * ConfigurationBuilder.prototype. Defaults to `true` when there is more than
   * one entrypoint.
   */
  readonly splitting?: boolean;
  /**
   * A tsconfig (relative to `dir`) wired with the ts-patch `plugins` that lower
   * authoring sugar -- in practice `nameof<T>()` via
   * @rhombus-std/primitives.transformer. When set, the JS pipeline gains a
   * lowering stage: `tspc -p <this>` emits transformed per-file JS into the
   * config's `outDir` (conventionally `.tspc-out/`), and `bun build` bundles
   * THAT emit instead of raw `src` -- `Bun.build` alone never runs ts-patch
   * transformers, so this stage is what gets `nameof` lowered into the shipped
   * `dist/*.js`. The d.ts pipeline is unaffected (`nameof` has no type-level
   * footprint).
   *
   * After bundling, the per-file lowered emit is KEPT at `dist/internal/` and
   * the package's `internal/*` export subpath points its `bun` condition there:
   * white-box consumers (sibling test packages) execute the same lowered JS a
   * published consumer would, instead of raw src whose un-lowered `nameof<T>()`
   * throws at import time. `dist/internal` is publish-excluded via a
   * `"!dist/internal"` entry in the package's `files`.
   */
  readonly tspcProject?: string;
}

/** Builds one package's dist artifacts (JS bundle + rolled .d.ts). */
export async function buildPackage(options: BuildPackageOptions): Promise<void> {
  const {
    dir,
    name,
    entrypoints = ["src/index.ts"],
    external = [],
    emitJs = true,
    dtsConfigs = ["rollup.dts.mjs"],
    assertNoJs = false,
    splitting = entrypoints.length > 1,
    tspcProject,
  } = options;

  const dist = join(dir, "dist");
  rmSync(dist, { recursive: true, force: true });

  // The lowering stage: emit transformer-lowered JS with tspc, bundle that.
  let stageDir: string | undefined;
  let jsEntrypoints = entrypoints.map((entry) => join(dir, entry));
  if (emitJs && tspcProject) {
    stageDir = join(dir, ".tspc-out");
    rmSync(stageDir, { recursive: true, force: true });
    const emit = spawnSync(
      "bun",
      ["x", "tspc", "-p", join(dir, tspcProject)],
      { cwd: dir, stdio: "inherit" },
    );
    if (emit.status !== 0) {
      throw new Error(`${name}: tspc lowering emit failed (${tspcProject})`);
    }
    // Map each src entrypoint onto its emitted stage file (src/x.ts -> .tspc-out/x.js).
    jsEntrypoints = entrypoints.map((entry) => join(stageDir!, entry.replace(/^src\//, "").replace(/\.ts$/, ".js")));
  }

  if (emitJs) {
    const js = await Bun.build({
      entrypoints: jsEntrypoints,
      outdir: dist,
      target: "node",
      format: "esm",
      external: [...external],
      splitting,
    });
    if (!js.success) {
      for (const log of js.logs) {
        console.error(log);
      }
      throw new Error(`${name}: bun build failed`);
    }
    if (stageDir) {
      // Keep the per-file lowered emit as the white-box (`internal/*`) runtime
      // surface -- see the `tspcProject` doc above.
      renameSync(stageDir, join(dist, "internal"));
    }
  }

  for (const config of dtsConfigs) {
    const dts = spawnSync(
      "bun",
      ["x", "rollup", "-c", join(dir, config)],
      { cwd: dir, stdio: "inherit" },
    );
    if (dts.status !== 0) {
      throw new Error(`${name}: rollup d.ts bundling failed (${config})`);
    }
  }

  if (assertNoJs && existsSync(join(dist, "index.js"))) {
    throw new Error(`${name}: unexpected runtime artifact dist/index.js -- this package is types-only`);
  }
}

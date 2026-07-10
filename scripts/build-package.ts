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
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve a single, self-consistent Go toolchain for the ttsc sidecar build and
 * hand back an env that pins to it.
 *
 * ttsc compiles the Go plugin (transforms/cmd/*) into a native sidecar on first
 * use. That compile must see ONE toolchain: ttsc ships its own Go SDK but
 * inherits GOROOT/GOBIN from the ambient environment, so a version split there
 * fails the build. We clear those, force `GOTOOLCHAIN=local` (no network
 * download of a pinned toolchain), and point TTSC_GO_BINARY at the mise-managed
 * `go`. GOTMPDIR is redirected onto a repo-local, disk-backed cache dir because
 * a cold typescript-go compile overruns a size-capped tmpfs `/tmp`.
 */
export function ttscEnv(repoRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  env.GOTOOLCHAIN = "local";
  const goTmp = join(repoRoot, "node_modules", ".cache", "ttsc-gobuild");
  mkdirSync(goTmp, { recursive: true });
  env.GOTMPDIR = goTmp;
  let goBin = env.TTSC_GO_BINARY ?? "";
  if (!goBin) {
    const miseGo = spawnSync("mise", ["which", "go"], { encoding: "utf8" });
    goBin = miseGo.status === 0 ? miseGo.stdout.trim() : "";
    if (goBin) {
      env.TTSC_GO_BINARY = goBin;
    }
  }
  // GOROOT/GOBIN must match the pinned `go`, not whatever toolchain the caller's
  // shell had active. Deleting them here is NOT enough: callers merge this env
  // via `Object.assign(process.env, …)`, which leaves any ambient GOROOT in place
  // — and a GOROOT whose std objects were built by a different `go` version than
  // TTSC_GO_BINARY splits the toolchain ("version go1.X does not match go tool
  // version go1.Y"). So POSITIVELY pin GOROOT to the resolved binary's own root,
  // which the merge then overrides the stale value with, and blank GOBIN.
  if (goBin) {
    // `go env GOROOT` ECHOES the GOROOT env var when it is set, so probe with it
    // cleared to get the binary's own built-in root rather than the stale ambient.
    const probeEnv = { ...process.env } as NodeJS.ProcessEnv;
    delete probeEnv.GOROOT;
    const goRoot = spawnSync(goBin, ["env", "GOROOT"], {
      encoding: "utf8",
      env: probeEnv,
    });
    if (goRoot.status === 0 && goRoot.stdout.trim()) {
      env.GOROOT = goRoot.stdout.trim();
    }
  }
  env.GOBIN = "";
  return env;
}

/**
 * Wire the ttsc/Go lowering plugin into a `Bun.build` call. The
 * `@ttsc/unplugin/bun` adapter runs the Go sidecar plugin(s) as an onLoad source
 * transform, so every source file is lowered as Bun bundles it. Resolves the
 * adapter from `dir` (its devDep under the isolated linker) and pins the Go
 * toolchain in-process (the plugin's `go build` inherits this env). Shared by
 * {@link buildPackage} (libraries) and the example build scripts.
 *
 * `ttscProject` supplies the compiler options (module resolution, lib, custom
 * conditions). `transforms`, when given, is the EXPLICIT plugin list and
 * overrides the adapter's default discovery — which otherwise auto-registers
 * EVERY installed package carrying a `ttsc.plugin` marker. That default is wrong
 * for a consumer that installs several transformer packages but must run a single
 * aggregate host: ttsc rejects multiple native backends in one pass, so such a
 * consumer passes the one aggregate specifier here.
 */
export async function ttscBunPlugin(
  dir: string,
  ttscProject: string,
  transforms?: readonly string[],
): Promise<Bun.BunPlugin> {
  Object.assign(process.env, ttscEnv(join(import.meta.dir, "..")));
  const adapter = Bun.resolveSync("@ttsc/unplugin/bun", dir);
  const ttscBun = (await import(adapter)).default as (
    options: { project: string; plugins?: readonly { transform: string }[] },
  ) => Bun.BunPlugin;
  const options: { project: string; plugins?: readonly { transform: string }[] } = {
    project: join(dir, ttscProject),
  };
  if (transforms) {
    options.plugins = transforms.map((transform) => ({ transform }));
  }
  return ttscBun(options);
}

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
  /**
   * The ttsc/Go analog of {@link tspcProject}: same lowering-stage shape, but
   * the emit is driven by `ttsc` (the typescript-go toolchain) running the Go
   * sidecar plugin named in this tsconfig's `plugins` array, instead of `tspc`
   * running the ts-patch plugin. A package picks its lowering ENGINE by setting
   * exactly one of the two keys.
   *
   * The Go plugin is compiled and cached on first use (once per cache key —
   * several minutes cold, since the typescript-go graph must compile, though
   * its object cache is the global GOCACHE so a warm second package pays only a
   * re-link). The toolchain is pinned via {@link ttscEnv}. Everything
   * downstream (bundle, `dist/internal` retention) is identical to the tspc
   * path.
   */
  readonly ttscProject?: string;
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
    ttscProject,
  } = options;

  if (tspcProject && ttscProject) {
    throw new Error(`${name}: set only one lowering engine — tspcProject XOR ttscProject`);
  }

  const dist = join(dir, "dist");
  rmSync(dist, { recursive: true, force: true });

  // The lowering stage. Both engines lower the same authoring sugar to the same
  // forms; a package selects one by setting tspcProject XOR ttscProject.
  //
  //   tspc (ts-patch): a SEPARATE emit — `tspc -p` writes transformer-lowered
  //   per-file JS into a stage dir, and `bun build` bundles THAT. The per-file
  //   emit is retained as `dist/internal/` (the white-box `internal/*` surface).
  //
  //   ttsc (typescript-go): an IN-BUNDLE transform — the @ttsc/unplugin/bun
  //   adapter runs the Go plugin as a `Bun.build` onLoad transform, so `bun
  //   build` lowers each source file as it bundles it. There is no separate
  //   per-file emit (hence no `dist/internal/` here — a ttsc package that needs
  //   the white-box surface is a follow-up).
  let stageDir: string | undefined;
  let jsEntrypoints = entrypoints.map((entry) => join(dir, entry));
  let bunPlugins: Bun.BunPlugin[] = [];
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
  } else if (emitJs && ttscProject) {
    bunPlugins = [await ttscBunPlugin(dir, ttscProject)];
  }

  if (emitJs) {
    const js = await Bun.build({
      entrypoints: jsEntrypoints,
      outdir: dist,
      target: "node",
      format: "esm",
      external: [...external],
      splitting,
      plugins: bunPlugins,
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

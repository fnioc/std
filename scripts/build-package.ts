// Shared publish-build logic for every @rhombus-std/config* package.
//
// This repo standardized on `moduleResolution: bundler` + extensionless
// relative imports (see /tsconfig.base.json). A plain `tsc` emit would leave
// those specifiers extensionless in dist/, which plain Node ESM cannot
// resolve -- so every published package bundles instead of emitting raw tsc
// output:
//
//   1. dist/bundle/*.js    -- `bun build` bundles each ESM entry into a single
//      file with resolved specifiers. `external` keeps peer deps out of the
//      bundle (a provider must patch the CONSUMER's ConfigurationBuilder, not a
//      private inlined copy); anything NOT external is inlined, which is how
//      @rhombus-std/config folds in @rhombus-toolkit/proxy-base (whose published
//      ESM uses extensionless relative imports Node's resolver rejects).
//   2. dist/bundle/*.d.ts  -- rollup-plugin-dts rolls the public type surface
//      into one declaration file per configured rollup config.
//
// The bundled artifacts live under dist/bundle/ — a role-named sibling of the
// dist/stage/ lowering emit (see `ttscProject`), so `dist` holds one directory
// per build role. core is the one exception: it is types-only (emitJs: false)
// and asserts no runtime .js slips into dist/bundle.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read the resolved transformer specifiers from a tsconfig's
 * `compilerOptions.plugins[].transform`, following `extends`. `tsc --showConfig`
 * resolves the whole chain and echoes `plugins` verbatim, so a plugin declared in
 * an extended base is still seen.
 */
export function readTsconfigTransforms(dir: string, tsconfigRel: string): string[] {
  const res = spawnSync('bun', ['x', 'tsc', '--showConfig', '-p', join(dir, tsconfigRel)], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`${tsconfigRel}: tsc --showConfig failed:\n${res.stderr}`);
  }
  const config = JSON.parse(res.stdout) as {
    compilerOptions?: { plugins?: readonly { transform?: unknown; }[]; };
  };
  const plugins = config.compilerOptions?.plugins ?? [];
  return plugins
    .map((plugin) => plugin.transform)
    .filter((transform): transform is string => typeof transform === 'string');
}

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
  env.GOTOOLCHAIN = 'local';
  const goTmp = join(repoRoot, 'node_modules', '.cache', 'ttsc-gobuild');
  mkdirSync(goTmp, { recursive: true });
  env.GOTMPDIR = goTmp;
  let goBin = env.TTSC_GO_BINARY ?? '';
  if (!goBin) {
    const miseGo = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
    goBin = miseGo.status === 0 ? miseGo.stdout.trim() : '';
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
    const goRoot = spawnSync(goBin, ['env', 'GOROOT'], {
      encoding: 'utf8',
      env: probeEnv,
    });
    if (goRoot.status === 0 && goRoot.stdout.trim()) {
      env.GOROOT = goRoot.stdout.trim();
    }
  }
  env.GOBIN = '';
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
  Object.assign(process.env, ttscEnv(join(import.meta.dir, '..')));
  const adapter = Bun.resolveSync('@ttsc/unplugin/bun', dir);
  const ttscBun = (await import(adapter)).default as (
    options: { project: string; plugins?: readonly { transform: string; }[]; },
  ) => Bun.BunPlugin;
  const options: { project: string; plugins?: readonly { transform: string; }[]; } = {
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
  /** Throw if `dist/bundle/index.js` exists after building -- the types-only invariant. */
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
   * A tsconfig (relative to `dir`) wired with the ttsc/Go `plugins` that lower
   * authoring sugar (`nameof<T>()`, the registration/options/config stages). When
   * set, the JS pipeline gains a lowering STAGE that runs before the bundle:
   *
   *   1. STAGE — a per-file `Bun.build` compiles every `src/**\/*.ts` as its own
   *      entrypoint with ALL imports external and the `@ttsc/unplugin/bun` adapter
   *      active, so each file is lowered (its `nameof`/`add`/… rewritten) but not
   *      bundled. The lowered per-file JS lands in a stage dir (`.ttsc-out/`).
   *   2. BUNDLE — the existing `bun build` pass then bundles the STAGE emit (NOT
   *      raw src) with no plugin, resolving the extensionless relative imports the
   *      stage preserved. Lowering commutes with bundling, so the shipped
   *      `dist/*.js` is what a no-transformer author would have hand-written.
   *
   * The d.ts pipeline is unaffected (`nameof` and friends have no type-level
   * footprint). After bundling, the per-file lowered emit is KEPT at `dist/stage/`
   * — named for its build role — and the package's `./private/*` export alias
   * points its `bun` condition there (alias and disk path are independent): so
   * white-box consumers (sibling test packages) execute the same lowered JS a
   * published consumer would, instead of raw src whose un-lowered `nameof<T>()`
   * throws at import time. `dist/stage` is publish-excluded via a `"!dist/stage"`
   * entry in the package's `files`.
   *
   * The Go plugin is compiled and cached on first use (once per cache key —
   * several minutes cold, since the typescript-go graph must compile, though its
   * object cache is the global GOCACHE so a warm second package pays only a
   * re-link). The toolchain is pinned via {@link ttscEnv}.
   */
  readonly ttscProject?: string;
  /**
   * The EXPLICIT ttsc plugin specifiers to run, threaded into
   * {@link ttscBunPlugin}'s `plugins` list. Passing them suppresses the
   * adapter's auto-discovery (which would register every installed transformer
   * package carrying a `ttsc.plugin` marker); the derived build reads them from
   * the consumer's `tsconfig.ttsc.json` so the plugin set is pinned by config,
   * not by which packages happen to be installed. Ignored unless `ttscProject`
   * is set.
   */
  readonly ttscTransforms?: readonly string[];
}

/** Builds one package's dist artifacts (JS bundle + rolled .d.ts). */
export async function buildPackage(options: BuildPackageOptions): Promise<void> {
  const {
    dir,
    name,
    entrypoints = ['src/index.ts'],
    external = [],
    emitJs = true,
    dtsConfigs = ['rollup.dts.mjs'],
    assertNoJs = false,
    splitting = entrypoints.length > 1,
    ttscProject,
    ttscTransforms,
  } = options;

  const dist = join(dir, 'dist');
  const bundleDir = join(dist, 'bundle');
  rmSync(dist, { recursive: true, force: true });

  // The lowering stage (Go/ttsc engine). Stage-then-bundle: a per-file Bun.build
  // lowers every src file in isolation, and the main bundle then consumes that
  // stage emit with no plugin. Lowering commutes with bundling, so the shipped
  // bundle matches the hand-written no-transformer form — while the separate
  // per-file stage emit is retained as `dist/stage/` (reached through the
  // `./private/*` export alias, the white-box runtime surface). A package opts in
  // by setting `ttscProject`.
  let stageDir: string | undefined;
  let jsEntrypoints = entrypoints.map((entry) => join(dir, entry));
  if (emitJs && ttscProject) {
    stageDir = join(dir, '.ttsc-out');
    rmSync(stageDir, { recursive: true, force: true });
    const srcDir = join(dir, 'src');
    // Every src module as its own entrypoint (declaration files carry no runtime
    // and are skipped, matching a `tsc` emit). ALL imports external so the stage
    // is a pure per-file transform — nothing is bundled here, the specifiers are
    // preserved for the bundle pass to resolve.
    const stageEntrypoints = [...new Bun.Glob('**/*.ts').scanSync({ cwd: srcDir, absolute: true })]
      .filter((path) => !path.endsWith('.d.ts'));
    const staged = await Bun.build({
      entrypoints: stageEntrypoints,
      outdir: stageDir,
      root: srcDir,
      target: 'node',
      format: 'esm',
      external: ['*'],
      plugins: [await ttscBunPlugin(dir, ttscProject, ttscTransforms)],
    });
    if (!staged.success) {
      for (const log of staged.logs) {
        console.error(log);
      }
      throw new Error(`${name}: ttsc lowering stage failed (${ttscProject})`);
    }
    // Map each src entrypoint onto its emitted stage file (src/x.ts -> .ttsc-out/x.js).
    jsEntrypoints = entrypoints.map((entry) => join(stageDir!, entry.replace(/^src\//, '').replace(/\.ts$/, '.js')));
  }

  if (emitJs) {
    const js = await Bun.build({
      entrypoints: jsEntrypoints,
      outdir: bundleDir,
      target: 'node',
      format: 'esm',
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
      // Keep the per-file lowered emit at dist/stage -- the white-box runtime
      // surface reached through the `./private/*` alias (see the `ttscProject`
      // doc above).
      renameSync(stageDir, join(dist, 'stage'));
    }
  }

  for (const config of dtsConfigs) {
    const dts = spawnSync(
      'bun',
      ['x', 'rollup', '-c', join(dir, config)],
      { cwd: dir, stdio: 'inherit' },
    );
    if (dts.status !== 0) {
      throw new Error(`${name}: rollup d.ts bundling failed (${config})`);
    }
  }

  if (assertNoJs && existsSync(join(bundleDir, 'index.js'))) {
    throw new Error(`${name}: unexpected runtime artifact dist/bundle/index.js -- this package is types-only`);
  }
}

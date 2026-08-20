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
// per build role. A types-only package (emitJs: false) asserts no runtime .js
// slips into dist/bundle.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Read the resolved transformer specifiers from a tsconfig's
 * `compilerOptions.plugins[].transform`, following `extends`. `tsc --showConfig`
 * resolves the whole chain and echoes `plugins` verbatim, so a plugin declared in
 * an extended base is still seen.
 */
export function readTsconfigTransforms(dir: string, tsconfigRel: string): string[] {
  const res = spawnSync('bun', ['x', 'tsc', '--showConfig', '-p', join(dir, tsconfigRel)], { cwd: dir,
    encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`${tsconfigRel}: tsc --showConfig failed:\n${res.stderr}`);
  }
  const config = JSON.parse(res.stdout) as { compilerOptions?: { plugins?: readonly { transform?: unknown; }[]; }; };
  const plugins = config.compilerOptions?.plugins ?? [];
  return plugins.map((plugin) => plugin.transform).filter((transform): transform is string =>
    typeof transform === 'string'
  );
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
 * `go`. GOTMPDIR (Go build scratch) and TTSC_CACHE_DIR (the content-keyed plugin
 * cache) are redirected onto a shared, disk-backed home dir because a cold
 * typescript-go compile overruns the per-user-quota tmpfs `/tmp`.
 */
export function ttscEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  env.GOTOOLCHAIN = 'local';
  // GOTMPDIR (Go build scratch) and TTSC_CACHE_DIR (the content-keyed
  // compiled-sidecar cache) both default to a shared home dir, off the
  // per-user-quota tmpfs /tmp. The cache is content-keyed, so one location is safe
  // to share across every worktree, suite, and session — the cold sidecar compile
  // is paid once per machine. An explicit env value wins (CI / a shell overrides).
  const goTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
  mkdirSync(goTmp, { recursive: true });
  env.GOTMPDIR = goTmp;
  const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
  mkdirSync(ttscCache, { recursive: true });
  env.TTSC_CACHE_DIR = ttscCache;
  // Setting GOCACHE — even to Go's own default path — flips ttsc from a private
  // object cache under TTSC_CACHE_DIR to the ambient one, sharing compiled
  // objects with the transforms Go gates: a cold sidecar build mostly re-links.
  env.GOCACHE = process.env.GOCACHE ?? join(homedir(), '.cache', 'go-build');
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
    const goRoot = spawnSync(goBin, ['env', 'GOROOT'], { encoding: 'utf8', env: probeEnv });
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
export async function ttscBunPlugin(dir: string, ttscProject: string, transforms?: readonly string[],
  compilerOptions?: Readonly<Record<string, unknown>>): Promise<Bun.BunPlugin> {
  Object.assign(process.env, ttscEnv());
  const adapter = Bun.resolveSync('@ttsc/unplugin/bun', dir);
  interface AdapterOptions {
    project: string;
    plugins?: readonly { transform: string; }[];
    compilerOptions?: Readonly<Record<string, unknown>>;
  }
  const ttscBun = (await import(adapter)).default as (options: AdapterOptions) => Bun.BunPlugin;
  const options: AdapterOptions = { project: join(dir, ttscProject) };
  if (transforms) {
    options.plugins = transforms.map((transform) => ({ transform }));
  }
  if (compilerOptions) {
    options.compilerOptions = compilerOptions;
  }
  return ttscBun(options);
}

export interface StageLoweringOptions {
  /** The package root. */
  readonly dir: string;
  /** The package name, for error messages. */
  readonly name: string;
  /** The tsconfig (relative to `dir`) the Go/ttsc engine reads. */
  readonly ttscProject: string;
  /** An explicit plugin list; omit to let ttsc auto-discovery run. */
  readonly ttscTransforms?: readonly string[];
}

/**
 * Compile every `src/**\/*.ts` as its own entrypoint with ALL imports external
 * and the `@ttsc/unplugin/bun` adapter active, so each file is lowered but
 * nothing is bundled, and return the stage directory the emit landed in.
 *
 * The stage directory is `<dir>/.ttsc-out`, which every `tsconfig.ttsc.json`
 * also names as its `outDir` -- so the engine writes its own generated modules
 * (the hoisted `Type` consts a `typefor<T>()` call site references) into the
 * same directory, and the bundle pass that consumes this emit resolves them
 * alongside the lowered files. The directory is emptied first, so a build never
 * inherits a file the current sources no longer produce.
 *
 * Shared by {@link buildPackage} and the example build scripts: both stage, then
 * bundle the stage with no plugin. Lowering commutes with bundling, so the
 * bundle is what a no-transformer author would have hand-written.
 */
export async function stageLowering(options: StageLoweringOptions): Promise<string> {
  const { dir, name, ttscProject, ttscTransforms } = options;
  const stageDir = join(dir, '.ttsc-out');
  rmSync(stageDir, { recursive: true, force: true });
  const srcDir = join(dir, 'src');
  // Declaration files carry no runtime and are skipped, matching a `tsc` emit.
  const entrypoints = [...new Bun.Glob('**/*.ts').scanSync({ cwd: srcDir, absolute: true })].filter((path) =>
    !path.endsWith('.d.ts')
  );
  const staged = await Bun.build({ entrypoints, outdir: stageDir, root: srcDir, target: 'node', format: 'esm',
    external: ['*'], plugins: [await ttscBunPlugin(dir, ttscProject, ttscTransforms)] });
  if (!staged.success) {
    for (const log of staged.logs) {
      console.error(log);
    }
    throw new Error(`${name}: ttsc lowering stage failed (${ttscProject})`);
  }
  return stageDir;
}

/** The stage file a `src`-relative entrypoint was lowered into. */
export function stagedEntrypoint(stageDir: string, entry: string): string {
  return join(stageDir, entry.replace(/^src\//, '').replace(/\.ts$/, '.js'));
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
   * runtime identity -- two entrypoints that patch the SAME prototype must
   * see one copy of it. Defaults to `true` when there is more than one
   * entrypoint.
   */
  readonly splitting?: boolean;
  /**
   * A tsconfig (relative to `dir`) whose existence opts the package into the
   * ttsc/Go lowering that rewrites authoring sugar (`tokenfor<T>()` and the
   * inline-substituted registration / options / config forms). When
   * set, the JS pipeline gains a lowering STAGE that runs before the bundle:
   *
   *   1. STAGE — {@link stageLowering} compiles every `src/**\/*.ts` as its own
   *      entrypoint with ALL imports external and the `@ttsc/unplugin/bun` adapter
   *      active, so each file is lowered (its `typefor`/`add`/… rewritten) but not
   *      bundled. The lowered per-file JS lands in a stage dir (`.ttsc-out/`),
   *      beside the modules the engine generates for itself.
   *   2. BUNDLE — the existing `bun build` pass then bundles the STAGE emit (NOT
   *      raw src) with no plugin, resolving the extensionless relative imports the
   *      stage preserved. Lowering commutes with bundling, so the shipped
   *      `dist/*.js` is what a no-transformer author would have hand-written.
   *
   * The d.ts pipeline is unaffected (`typefor` and friends have no type-level
   * footprint). After bundling, the per-file lowered emit is KEPT at `dist/stage/`
   * — named for its build role — as an inspectable record of what the bundle
   * consumed. It is publish-excluded via a `"!dist/stage"` entry in the
   * package's `files`; in-repo consumers never resolve it (they run source,
   * lowered at load time by scripts/ttsc-preload.ts).
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

/**
 * A rolled `.d.ts` whose only surviving content is a `declare module '…' { … }`
 * augmentation block loses module-hood the moment rollup-plugin-dts drops the
 * now-unused imports around it: a file with no top-level `import`/`export`
 * statement is a GLOBAL SCRIPT to TypeScript, so its `declare module` block is
 * read as a fresh module declaration rather than an augmentation of the named
 * module wherever a consuming program also sees that module's real exports —
 * corrupting the whole program. This is common for an augmentation whose
 * members return the receiver type they augment (a chaining verb): the only
 * import that referenced the receiver becomes dead, since the identifier
 * inside `declare module` resolves to the block's own reopened interface, not
 * the import.
 *
 * Appends a bare `export {};` to any rolled `.d.ts` under `bundleDir` that has
 * no top-level `import`/`export` line, restoring module-hood without changing
 * the augmentation's meaning.
 */
export function ensureDtsModuleHood(bundleDir: string): void {
  for (const entry of readdirSync(bundleDir)) {
    if (!entry.endsWith('.d.ts')) {
      continue;
    }
    const path = join(bundleDir, entry);
    const content = readFileSync(path, 'utf8');
    if (!/^(import|export)\b/m.test(content)) {
      writeFileSync(path, `${content.trimEnd()}\nexport {};\n`);
    }
  }
}

/** Builds one package's dist artifacts (JS bundle + rolled .d.ts). */
export async function buildPackage(options: BuildPackageOptions): Promise<void> {
  const { dir, name, entrypoints = ['src/index.ts'], external = [], emitJs = true, dtsConfigs = ['rollup.dts.mjs'],
    assertNoJs = false, splitting = entrypoints.length > 1, ttscProject, ttscTransforms } = options;

  const dist = join(dir, 'dist');
  const bundleDir = join(dist, 'bundle');
  rmSync(dist, { recursive: true, force: true });

  // The lowering stage (Go/ttsc engine). Stage-then-bundle: a per-file Bun.build
  // lowers every src file in isolation, and the main bundle then consumes that
  // stage emit with no plugin. Lowering commutes with bundling, so the shipped
  // bundle matches the hand-written no-transformer form — while the separate
  // per-file stage emit is retained as `dist/stage/`. A package opts in by
  // setting `ttscProject`.
  let stageDir: string | undefined;
  let jsEntrypoints = entrypoints.map((entry) => join(dir, entry));
  if (emitJs && ttscProject) {
    stageDir = await stageLowering({ dir, name, ttscProject, ttscTransforms });
    jsEntrypoints = entrypoints.map((entry) => stagedEntrypoint(stageDir!, entry));
  }

  if (emitJs) {
    const js = await Bun.build({ entrypoints: jsEntrypoints, outdir: bundleDir, target: 'node', format: 'esm',
      external: [...external], splitting });
    if (!js.success) {
      for (const log of js.logs) {
        console.error(log);
      }
      throw new Error(`${name}: bun build failed`);
    }
    if (stageDir) {
      // Keep the per-file lowered emit at dist/stage (see the `ttscProject`
      // doc above).
      renameSync(stageDir, join(dist, 'stage'));
    }
  }

  for (const config of dtsConfigs) {
    const dts = spawnSync('bun', ['x', 'rollup', '-c', join(dir, config)], { cwd: dir, stdio: 'inherit' });
    if (dts.status !== 0) {
      throw new Error(`${name}: rollup d.ts bundling failed (${config})`);
    }
  }
  ensureDtsModuleHood(bundleDir);

  if (assertNoJs && existsSync(join(bundleDir, 'index.js'))) {
    throw new Error(`${name}: unexpected runtime artifact dist/bundle/index.js -- this package is types-only`);
  }
}

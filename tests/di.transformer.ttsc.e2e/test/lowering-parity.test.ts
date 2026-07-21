import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e parity: drives the REAL ttsc (typescript-go toolchain) over
// a temp project that wires the Go registration plugin through the
// `@rhombus-std/di.transformer/ttsc` descriptor, then asserts the emitted JS
// carries the SAME byte-identical token strings and lowered call shapes the
// hand-written TypeScript registration transformer produces (the parity corpus
// lives in tests/di.transformer.test/test/*.test.ts).
//
// The throwaway project lives OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>: it must sit outside any
// enclosing package.json, or ttsc re-roots the fixture's local tokens as members
// of that package (a sandbox under the monorepo derives
// `@rhombus-std/monorepo/…:ILocal` instead of the package-less `./app:ILocal`).
// Keying on the worktree dir name keeps concurrent sessions in different worktrees
// from colliding, and off /tmp (a per-user-quota tmpfs here). The ttsc plugin
// cache is content-keyed and shared machine-wide at ~/.cache/fnioc-ttsc/cache
// (keyed sidecar binaries + a ~3G Go object cache), so the cold ~5-minute Go
// plugin build is paid once per machine, not once per suite. This suite needs the
// Go toolchain, so it is kept OUT of the default gate (script `test:e2e`) and
// self-skips when go is not resolvable.
//
// Toolchain: ttsc ships its own Go SDK and prefers it, but inherits GOROOT from
// the ambient (mise) environment — a version split there makes the plugin compile
// fail. Pin to one self-consistent toolchain via TTSC_GO_BINARY + GOTOOLCHAIN=local.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const DI = join(REPO_ROOT, 'libraries', 'di.transformer');

// Outside the repo tree (see the header: an enclosing package.json re-roots token
// derivation), keyed by the worktree dir name so concurrent sessions don't collide.
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'di');
// The plugin cache (keyed sidecar binaries) and the Go build scratch/object cache
// are content-keyed, so one machine-wide location is shared across every suite,
// worktree, and session. Default-if-unset so CI or a shell can override.
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
const COLD_BUILD_MS = 420_000;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
    // A re-run reusing this project dir: the existing entry's target may be a
    // now-deleted worktree path (a dangling symlink), not the stable in-repo
    // path the old EEXIST-skip assumed. Relink unconditionally rather than
    // trusting it — the alternative is a stale dangling symlink surviving
    // until the NEXT run fails with a spurious "typescript is required".
    rmSync(linkPath, { force: true });
    symlinkSync(target, linkPath);
  }
}

/** A build env with a single self-consistent Go toolchain (see file header). */
function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = 'local';
  mkdirSync(goBuildTmp, { recursive: true });
  env.GOTMPDIR = goBuildTmp;
  mkdirSync(ttscCache, { recursive: true });
  env.TTSC_CACHE_DIR = ttscCache;
  const miseGo = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
  const goBin = miseGo.status === 0 ? miseGo.stdout.trim() : '';
  if (goBin) {
    env.TTSC_GO_BINARY = goBin;
  }
  return env;
}

let app = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  const nm = join(projDir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  mkdirSync(join(projDir, 'src'), { recursive: true });
  rmSync(join(projDir, 'dist'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI, join(nm, '@rhombus-std', 'di.transformer'));

  // A package-public library exporting the service interface through a subpath —
  // exercises the Tier-1 (import-specifier) token in a registration.
  const lib = join(nm, 'your-lib');
  mkdirSync(join(lib, 'contracts'), { recursive: true });
  writeFileSync(
    join(lib, 'package.json'),
    JSON.stringify({
      name: 'your-lib',
      version: '3.4.5',
      exports: { '.': './index.js', './contracts': './contracts/index.js' },
    }),
  );
  // The barrel re-exports IUserRepo so its token derives from the canonical
  // public specifier (`your-lib:IUserRepo`); the strict derivation rejects a
  // token reachable only through a non-barrel, non-`./tokens/*` subpath.
  writeFileSync(join(lib, 'index.d.ts'), `export { IUserRepo } from "./contracts/index.js";\n`);
  writeFileSync(join(lib, 'contracts', 'index.d.ts'), `export interface IUserRepo {}\n`);

  writeFileSync(join(projDir, 'src', 'nameof.ts'), `export declare function nameof<T>(): string;\n`);

  // The ambient `declare module "@rhombus-std/di.core"` — the authoring interfaces
  // (runtime + sugar overloads) the transformer's forms anchor on. A script
  // `.d.ts` so the block is an ambient module declaration.
  writeFileSync(
    join(projDir, 'src', 'di-core.d.ts'),
    `declare module "@rhombus-std/di.core" {
  export type Ctor<A extends any[] = any[], I = unknown> = new(...args: A) => I;
  export type Func<A extends any[] = any[], R = unknown> = (...args: A) => R;
  export interface AddBuilder<Scopes extends string = string> {
    as(scope: Scopes): void;
    as<S extends Scopes>(): void;
  }
  export interface IServiceManifestBase<Scopes extends string = string, Provider = unknown> {
    add(token: string, ctor: Ctor, signatures?: readonly (readonly unknown[])[]): AddBuilder<Scopes>;
    add<I>(ctor: Ctor<any[], I>): AddBuilder<Scopes>;
    add<I>(factory: Func<any[], I>): AddBuilder<Scopes>;
    addFactory<I>(factory: Func<any[], I>): AddBuilder<Scopes>;
    addValue<I>(value: I): void;
  }
  export interface IRequiredResolver {
    resolve<T>(token: string): T;
    resolve<T>(): T;
  }
  export interface IServiceQuery {
    isService(token: string): boolean;
    isService<T>(): boolean;
  }
  export interface IResolver extends IRequiredResolver, IServiceQuery {
    resolveAsync<T>(): Promise<T>;
    tryResolve<T>(): T | undefined;
  }
  export interface IServiceProvider<S extends string = string> extends IResolver {}
  export type IServiceManifest<S extends string = string> = IServiceManifestBase<S, IServiceProvider<S>>;
  export namespace Nested {
    export interface IServiceManifestBase<Scopes extends string = string> {
      add<I>(ctor: Ctor<any[], I>): AddBuilder<Scopes>;
    }
    export interface IResolver {
      resolve<T>(): T;
    }
  }
}
`,
  );

  writeFileSync(
    join(projDir, 'src', 'app.ts'),
    `
import { nameof } from "./nameof";
import { IUserRepo } from "your-lib";
import type { Nested, IResolver as DiResolver, IServiceManifest, IServiceManifestBase, IServiceProvider } from "@rhombus-std/di.core";

// The Keyed<T, K> phantom brand (declared locally — the transformer detects it
// structurally by the computed-symbol \`[KEY]\` property, not by import source):
// a key is a \`#<key>\` suffix on the ordinary token the underlying T derives.
declare const KEY: unique symbol;
type Keyed<T, K extends string> = T & { readonly [KEY]?: K };

// The open-generic hole brand, so a keyed base can itself carry a hole.
declare const HOLE: unique symbol;
type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
type $<N extends number> = Hole<N>;

interface ILogger {}
interface IDbConnection {}
interface ICache {}
interface IThing<T> {}
interface IRepo<T> {}
class ConsoleLogger implements ILogger {}
class SqlUserRepo implements IUserRepo {
  constructor(log: ILogger, db: IDbConnection, table: string) {}
}
class RedisCache implements ICache {}
class CacheConsumer {
  constructor(cache: Keyed<ICache, "redis">) {}
}
// A generic impl whose keyed ctor dep keys an OPEN-generic base: after the
// instantiation substitutes the hole, the base must render \`IThing<$1>\` and
// compose \`#redis\` onto it — the exotic keyed-in-open-generic parity case.
class ThingRepo<T> implements IRepo<T> {
  constructor(thing: Keyed<IThing<T>, "redis">) {}
}

declare const services: IServiceManifest<string>;
declare const provider: IServiceProvider<string>;

services.add<ILogger>(ConsoleLogger).as<"singleton">();
services.add<IUserRepo>(SqlUserRepo).as<"request">();
services.add<Keyed<ICache, "redis">>(RedisCache).as<"singleton">();
services.add<CacheConsumer>(CacheConsumer).as<"singleton">();
services.add<IRepo<$<1>>>(ThingRepo<$<1>>).as<"singleton">();

export const marker = nameof<IUserRepo>();
export const dep = provider.resolve<ILogger>();
export const known = provider.isService<ILogger>();

// ── receiver-shape POSITIVES (every receiver whose member resolves to di.core) ──
interface ISub {}
interface IReg {}
interface IGen {}
class SubImpl implements ISub {}
class RegImpl implements IReg {}

// (b) subinterface receiver
interface MyManifest extends IServiceManifestBase {}
declare const sub: MyManifest;
sub.add<ISub>(SubImpl).as<"singleton">();

// (c) user concrete class + @augment + empty extends-merge
declare function augment(token: string): <T>(target: T) => T;
@augment("@rhombus-std/di.core:IServiceManifest")
class MyRegistry {}
interface MyRegistry extends IServiceManifestBase {}
declare const reg: MyRegistry;
reg.add<IReg>(RegImpl).as<"singleton">();

// (d) generic bound by IResolver — pinned via the resolve family (registration is
// top-level-only by design)
function wireGeneric<R extends DiResolver>(r: R) {
  return r.resolve<IGen>();
}
export const gen = wireGeneric(provider);

// ── receiver-shape NEGATIVES (unrelated members must be left verbatim) ──────────
interface IFake {}
interface IEntity {}
interface INr {}
interface IBag {}
interface IRbag {}
interface INested {}
class FakeImpl implements IFake {}
class BagImpl implements IBag {}

// (e) an unrelated same-named local stub class
class FakeManifest {
  add<I>(ctor: new() => I): { as<S extends string>(): void } {
    return { as() {} };
  }
}
declare const fake: FakeManifest;
export const fakeReg = fake.add<IFake>(FakeImpl);

// (g) Set.add / repo.add-style false positives
const nums = new Set<number>();
nums.add(1);
class Repo { add<T>(entity: T): void {} }
declare const repo: Repo;
declare const entity: IEntity;
repo.add<IEntity>(entity);

// (h) resolve family on a non-IResolver receiver
class NotResolver { resolve<T>(): T { return {} as T; } }
declare const nr: NotResolver;
export const notDep = nr.resolve<INr>();

// (f) anonymous / structural object receivers (add + resolve)
const bag = { add<I>(ctor: new() => I): { as(s: string): void } { return { as() {} }; } };
export const bagReg = bag.add<IBag>(BagImpl);
const rbag = { resolve<T>(): T { return {} as T; } };
export const rbagDep = rbag.resolve<IRbag>();

// (i) namespace-nested declaring interfaces (add + resolve)
declare const nested: Nested.IServiceManifestBase;
export const nestedReg = nested.add<INested>(FakeImpl);
declare const nestedResolver: Nested.IResolver;
export const nestedDep = nestedResolver.resolve<INested>();
`,
  );
  writeFileSync(
    join(projDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2022'],
        strict: true,
        outDir: 'dist',
        rootDir: 'src',
        skipLibCheck: true,
        noEmitOnError: false,
        plugins: [{ transform: '@rhombus-std/di.transformer/ttsc' }],
      },
      include: ['src/**/*'],
    }),
  );

  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], {
    cwd: projDir,
    encoding: 'utf8',
    env: goEnv(),
  });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  // ttsc runs the plugin as a SOURCE-to-source stage: it emits the lowered
  // TypeScript for each file as a stdout envelope (not a written dist/*.js). The
  // production consumer (a bundler via @ttsc/unplugin) then type-strips that
  // source to JS — which is where the type-only scaffolding (`declare const
  // services: { add<I>… }`, interface decls) disappears. Reproduce that final
  // step here so the assertions test the SHIPPED JS, not the intermediate TS:
  // otherwise a retained generic type annotation reads as an un-lowered call.
  let lowered: string;
  try {
    lowered = readFileSync(join(projDir, 'dist', 'app.js'), 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    lowered = envelope.typescript['src/app.ts'] ?? '';
  }
  app = new Bun.Transpiler({ loader: 'ts' }).transformSync(lowered);
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('ttsc/Go registration lowering byte-parity', () => {
  test('no type-argument authoring forms survive the lowering', () => {
    expect(app).not.toContain('add<');
    expect(app).not.toContain('.as<');
    expect(app).not.toContain('resolve<');
    expect(app).not.toContain('isService<');
    expect(app).not.toContain('nameof<');
  });

  test('zero-arg class registration → token + empty inline signature + scope', () => {
    // services.add<ILogger>(ConsoleLogger).as<"singleton">()
    expect(app).toContain(`"./app:ILogger"`);
    expect(app).toContain('ConsoleLogger');
    expect(app).toContain(`.as("singleton")`);
  });

  test('multi-param ctor → package-public service token + inline dep signature (Rule 1)', () => {
    // The service token is the Tier-1 import specifier; the ctor deps are the
    // app-internal interface tokens and the bare intrinsic "string" (Rule 1).
    expect(app).toContain(`"your-lib:IUserRepo"`);
    expect(app).toContain(`"./app:IDbConnection"`);
    expect(app).toContain(`"string"`);
    expect(app).toContain(`.as("request")`);
  });

  test('nameof<T>() → the same byte-identical package-public token', () => {
    expect(app).toContain(`marker = "your-lib:IUserRepo"`);
  });

  test('tokenless resolve<I>() → resolve("<token>")', () => {
    expect(app).toContain(`resolve("./app:ILogger")`);
  });

  test('tokenless isService<I>() → isService("<token>")', () => {
    expect(app).toContain(`isService("./app:ILogger")`);
  });

  test('add<Keyed<T, "k">>(Impl) → registration under the <base>#k token', () => {
    // The keyed registration composes the plain ICache token with a `#redis`
    // suffix — byte-identical to the hand-written keyed lowering.
    expect(app).toContain(`services.add("./app:ICache#redis", RedisCache,`);
  });

  test('Keyed<T, "k"> ctor param → dependency signature carries <base>#k', () => {
    // CacheConsumer's sole ctor dep lowers to the same composed keyed token, so
    // exact keyed resolution finds the keyed registration by identical string.
    expect(app).toContain(`[["./app:ICache#redis"]]`);
  });

  test('keyed base carrying an open-generic hole composes IThing<$1>#redis', () => {
    // ThingRepo's keyed ctor dep keys an OPEN-generic base; the substituted hole
    // must render `$1` inside the base BEFORE the `#redis` suffix. The Go engine
    // must use hole-aware base derivation here to stay byte-identical to the hand-written form
    // (a non-hole-aware derivation drops the key and hard-errors instead).
    expect(app).toContain(`services.add("./app:IRepo<$1>", ThingRepo,`);
    expect(app).toContain(`[["./app:IThing<$1>#redis"]]`);
  });

  // ── receiver-shape POSITIVES ────────────────────────────────────────────────
  test('(b) a subinterface receiver is lowered', () => {
    expect(app).toContain(`sub.add("./app:ISub", SubImpl,`);
  });

  test('(c) a user concrete class with @augment + extends-merge is lowered', () => {
    expect(app).toContain(`reg.add("./app:IReg", RegImpl,`);
  });

  test('(d) a generic bound by IResolver is lowered via the resolve family', () => {
    expect(app).toContain(`resolve("./app:IGen")`);
  });

  // ── receiver-shape NEGATIVES (no token minted, member left verbatim) ─────────
  test('(e) an unrelated same-named local manifest class is NOT lowered', () => {
    expect(app).not.toContain('fake.add("');
    expect(app).not.toContain('./app:IFake');
  });

  test('(g) Set.add / repo.add-style calls are NOT lowered', () => {
    expect(app).not.toContain('nums.add("');
    expect(app).not.toContain('repo.add("');
    expect(app).not.toContain('./app:IEntity');
  });

  test('(h) resolve on a non-IResolver receiver is NOT lowered', () => {
    expect(app).not.toContain('nr.resolve("');
    expect(app).not.toContain('./app:INr');
  });

  test('(f) anonymous/structural object receivers are NOT lowered (add + resolve)', () => {
    expect(app).not.toContain('bag.add("');
    expect(app).not.toContain('rbag.resolve("');
    expect(app).not.toContain('./app:IBag');
    expect(app).not.toContain('./app:IRbag');
  });

  test('(i) namespace-nested declaring interfaces are NOT lowered (add + resolve)', () => {
    expect(app).not.toContain('nested.add("');
    expect(app).not.toContain('nestedResolver.resolve("');
    expect(app).not.toContain('./app:INested');
  });
});

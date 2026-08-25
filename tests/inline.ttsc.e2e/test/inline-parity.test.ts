// Side-effect: installs `build` onto di.core's Manifest.
import { di } from '@rhombus-std/di';
import { DefaultManifest, LifetimeModel, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
// Importing this package also installs the addOptions augmentation onto Manifest
// through the OPEN augmentation registry — the same production path a consumer uses.
import { optionsAddressType } from '@rhombus-std/options.augmentations';

// Production-path e2e for the generic single-expression inline stage, the sole
// lowering path for the type-driven registration and lookup sugar. It drives the
// REAL ttsc over temp projects wiring the inline + primitive descriptors (all
// resolve to the one owner Go host), then asserts each authoring form lowers to
// exactly what a no-transformer author would have written by hand: the service
// type's derived token in front, every other argument untouched, and no
// authoring-form generic or derivation primitive left in the emit.
//
// The compilations run in per-worktree project dirs OUTSIDE the repo tree
// (~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>, off the per-user-quota tmpfs
// /tmp; it must sit outside any enclosing package.json or ttsc re-roots the
// fixture's token derivation to that package), all pointing ttsc at the single
// shared plugin cache (TTSC_CACHE_DIR, see goEnv). This matters: ttsc's plugin
// cache is resolved per project root, so an unpinned cache that lands under each
// project's own node_modules would build the SAME Go sidecar afresh (multi-minute
// cold compile, and a timeout-kill then abandons a build lock the next run must
// reclaim). One shared, content-keyed cache → the sidecar builds once cold per
// machine and every later compilation is warm.
//
// The inline stage reads di.core's REAL src (its rhombus-std inline entry + the
// out-of-barrel src/inline.ts body), so the real di.core is symlinked, not mocked.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');

// canonQuotes normalizes the two COSMETIC artifacts Bun.Transpiler (the type-strip
// step) introduces, so an assertion pins tokens + call structure rather than
// incidental formatting the production bundler discards anyway. The Go engine emits
// deterministic single-line, double-quoted output; Bun.Transpiler then (1) flips
// string quotes to whichever style dominates the file and (2) wraps long lines:
//   - every simple single-quoted literal → double quotes; and
//   - Bun's line-wrapping is rejoined delimiter-aware, restoring the emission's
//     single-line spacing (comma-SPACE preserved, so the round-trip regexes and
//     needles that carry `, ` keep matching). Top-level statement newlines are left
//     intact, so per-line lineWith() lookups still isolate one statement each.
// The exact byte-for-byte Go-printer parity is pinned separately at the Go tier.
function canonQuotes(s: string): string {
  return s.replace(/'([^'\\\n]*)'/g, '"$1"').replace(/([([{])\s*\n\s*/g, '$1').replace(/,\s*\n\s*/g, ', ').replace(
    /\n\s*\./g,
    '.',
  ).replace(/\s*\n\s*([)\]}])/g, '$1') // Bun emits a TRAILING comma when it wraps a call/array multi-line
    // (`f(\n  "a",\n)`); the deterministic single-line Go output (and the golden)
    // has none. Drop a comma immediately before a close delimiter (inter-element
    // commas are never adjacent to a close, so this only strips the trailing one).
    .replace(/,\s*([)\]}])/g, '$1');
}
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const DI_CORE = join(REPO_ROOT, 'libraries', 'di.core');
const DI_TRANSFORMER = join(REPO_ROOT, 'libraries', 'di.extras');
const PRIMITIVES = join(REPO_ROOT, 'libraries', 'primitives');
const PRIMITIVES_TRANSFORMER = join(REPO_ROOT, 'libraries', 'primitives.extras');

// One honest cold Go-sidecar compile fits comfortably here; the second (warm)
// compilation is seconds. Sized against the sibling suite's single-cold budget
// with headroom, now that the shared cache guarantees a single cold build.
const COLD_BUILD_MS = 600_000;

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

// Pin the ttsc plugin cache (compiled sidecar binary AND its go-build object
// cache) and the Go build scratch to the shared, content-keyed home dir, NOT the
// project-local default. The project dir would otherwise write its Go object
// cache (~3G) onto the per-user-quota tmpfs /tmp and risk EDQUOT; anchoring both
// under ~/.cache/fnioc-ttsc keeps the heavy cache off tmpfs and — being one
// shared path — makes every compilation (here and in every other suite/worktree)
// reuse the sidecar the first cold build produced. Default-if-unset for CI/shell.
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');

function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = 'local';
  mkdirSync(goBuildTmp, { recursive: true });
  env.GOTMPDIR = goBuildTmp;
  mkdirSync(ttscCache, { recursive: true });
  env.TTSC_CACHE_DIR = ttscCache;
  // Setting GOCACHE — even to Go's own default path — flips ttsc from a private
  // object cache under TTSC_CACHE_DIR to the ambient one, sharing compiled
  // objects with the transforms Go gates: a cold sidecar build mostly re-links.
  env.GOCACHE = process.env.GOCACHE ?? join(homedir(), '.cache', 'go-build');
  const miseGo = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
  const goBin = miseGo.status === 0 ? miseGo.stdout.trim() : '';
  if (goBin) {
    env.TTSC_GO_BINARY = goBin;
  }
  return env;
}

// ===========================================================================
// W2 — registration parity over the type-driven sugar.
//
// Three shapes of service type reach the same verb:
//
//   1. closed        services.add<ILogger>(ConsoleLogger, 'singleton')
//   2. open template services.add<IRepo<$<'1'>>>(ThingRepo)  (hole-carrying dep)
//   3. keyed         services.add<Keyed<ICache, 'redis'>>(RedisCache)
//
// WIRING. The chain sandbox deps {di.core, di.extras}, symlinks the authoring
// packages, and names ONE spawn descriptor. The always-on host runs its whole
// stage table: the inline stage substitutes the sugar body, which puts a
// `typefor<T>()` in front of the token-taking member, and the typefor primitive
// stage lowers the calls it mints. Every argument the
// author wrote after the ctor is carried through untouched — the sugar adds the
// token and nothing else.
//
// The sandbox points at the one shared TTSC_CACHE_DIR, so a sidecar built cold by
// any suite is reused warm here. di.core resolves to its source barrel, so
// inline substitution is exercised against the same source-first receiver every
// in-repo consumer sees.

const CHAIN_ROOT = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'chain');
const chainInlineDir = join(CHAIN_ROOT, 'inline');
const inferredDir = join(CHAIN_ROOT, 'inferred');

// The type-driven authoring overloads come from the real di.extras
// declare-module merge (the type-only import), so the declarations the stages
// anchor on are the publisher's own — the ones whose ownership claims the
// bodies. The consumer-merge suite covers the other assembly — the member-map
// `extends` shape a real dependency graph produces.
const AUTHORING_SOURCE = `
import type {} from '@rhombus-std/di.extras';

export {};
`;

// The closed and open service types, kept in one file so a whole-file compare
// pins import elision and surrounding text alongside the per-line tokens.
const CHAIN_SOURCE = `
import type { $, Manifest } from '@rhombus-std/di.core';

interface ILogger {}
interface IClock {}
interface IRepo<T> {}
interface IStore<T> {}

class ConsoleLogger implements ILogger {
  constructor(clock: IClock) {
    void clock;
  }
}
class NoDepsLogger implements ILogger {}
class ThingRepo {
  constructor(store: IStore<$<'1'>>) {
    void store;
  }
}

declare const services: Manifest<'singleton'>;

export const closed = services.add<ILogger>(ConsoleLogger, 'singleton');

export const emptySig = services.add<ILogger>(NoDepsLogger, 'singleton');

export const open = services.add<IRepo<$<'1'>>>(ThingRepo);
`;

// A KEYED service type. Base and key compose into ONE tag token, and the lookup
// side mints the identical token — that identity is what makes a keyed
// registration and a keyed lookup meet. Own file so the compare is isolated.
const KEYED_SOURCE = `
import type { Keyed, Manifest } from '@rhombus-std/di.core';

interface ICache {}
class RedisCache implements ICache {}

declare const services: Manifest<'singleton'>;

export const keyed = services.add<Keyed<ICache, 'redis'>>(RedisCache);
`;

// A sugar call with NO type argument. The stage cannot recover the service type
// from the call, so it refuses with a named diagnostic rather than deriving a
// token for `unknown` — compiled on its own, since the refusal fails the build.
// The lifetime is spelled because this vocabulary requires one: without it the
// call fails overload resolution first and the refusal is never the whole story.
const INFERRED_SOURCE = `
import type { Manifest } from '@rhombus-std/di.core';

class SelfRepo {}

declare const services: Manifest<'singleton'>;

export const self = services.add(SelfRepo, 'singleton');
`;

// Lookup-family source (W5). The type-driven get* forms lower through the inline
// bodies to the Type-taking member: `provider.resolve(typefor<T>())` and its
// two siblings, the type minted by the typefor stage. Own file so the lookup
// compare is isolated from the registration whole-file compare.
const RESOLVE_SOURCE = `
import type { IServiceProvider, Keyed } from '@rhombus-std/di.core';

// The tokenless get* overloads come from the real di.extras declare-module
// merge (the type-only import below); the value-driven faces are di.core's
// own runtime overloads and arrive with the interface itself.
import type {} from '@rhombus-std/di.extras';

interface IThing {}
interface ICache {}
interface IBar {}
interface IGadget {}

class Widget {
  constructor(bar: IBar) {
    void bar;
  }
}

function makeGadget(bar: IBar): IGadget {
  void bar;
  return {};
}

declare const provider: IServiceProvider;

export const tokenful = provider.resolve<IThing>();
export const tryTok = provider.resolve<IThing>();
export const many = provider.resolveMany<IThing>();
// A type LITERAL is a service type like any other: it derives its own token
// rather than collapsing to the literal value.
export const singular = provider.resolve<'dev'>();
// A keyed type argument composes base and key into ONE tag token — the same token
// the keyed registration mints, which is what makes the two meet at runtime.
export const keyedTok = provider.resolve<Keyed<ICache, 'redis'>>();
export const keyedKnown = provider.resolve<Keyed<ICache, 'redis'>>();
`;

// Steering the observed implementer type with a cast. The derivation reads the
// checker's type for the argument expression, so a cast at the call site
// rewrites the observed SHAPE — here narrowing Handler's two-parameter
// constructor to a one-parameter signature. Own file so the steering is compared in
// isolation.
const OVERRIDE_SOURCE = `
import type { Manifest } from '@rhombus-std/di.core';

interface IReq {}
interface ILog {}
interface IHandler {}
class Handler implements IHandler {
  constructor(req: IReq, log: ILog) {
    void req;
    void log;
  }
}

declare const services: Manifest<'singleton'>;

export const overridden = services.add<IHandler>(Handler as unknown as new(req: IReq) => IHandler);
`;

function writeChainSrc(dir: string): void {
  const src = join(dir, 'src');
  // The sandbox outlives the run that made it, and the tsconfig includes the whole
  // src tree — so a fixture this run no longer writes would still be compiled.
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'authoring.ts'), AUTHORING_SOURCE);
  writeFileSync(join(src, 'chain.ts'), CHAIN_SOURCE);
  writeFileSync(join(src, 'keyed.ts'), KEYED_SOURCE);
  writeFileSync(join(src, 'resolve.ts'), RESOLVE_SOURCE);
  writeFileSync(join(src, 'override.ts'), OVERRIDE_SOURCE);
}

function writeChainTsconfig(dir: string, plugins: Array<{ transform: string; }>): void {
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ESNext'], strict: true, outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false,
      plugins },
    include: ['src/**/*'],
  }));
}

function linkChainDeps(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  // di.core + di.extras + the primitives packages are symlinked in EVERY dir
  // (the di.extras descriptor the semantic tsconfig references must resolve
  // even though di.extras is absent from the semantic package.json deps).
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.extras'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.extras'));
}

function setupInferredWorkspace(): void {
  rmSync(join(inferredDir, 'dist'), { recursive: true, force: true });
  linkChainDeps(inferredDir);
  mkdirSync(join(inferredDir, 'src'), { recursive: true });
  writeFileSync(join(inferredDir, 'package.json'),
    JSON.stringify({ name: 'inferred-app', version: '0.0.0', dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' } }));
  writeFileSync(join(inferredDir, 'src', 'authoring.ts'), AUTHORING_SOURCE);
  writeFileSync(join(inferredDir, 'src', 'inferred.ts'), INFERRED_SOURCE);
  writeChainTsconfig(inferredDir, [{ transform: '@rhombus-std/di.extras/ttsc' }]);
}

function setupChainWorkspaces(): void {
  rmSync(join(chainInlineDir, 'dist'), { recursive: true, force: true });

  // Inline path: di.extras IN deps → the host scan activates the full stage
  // set (inline + typefor). The tsconfig spells the
  // primitives descriptors explicitly so ttsc has direct-discovery entries to
  // spawn the host with; the rest arrive through the scan. There is no semantic
  // (di-direct) sandbox — its output is the frozen `*.di-direct.js` golden.
  linkChainDeps(chainInlineDir);
  writeFileSync(join(chainInlineDir, 'package.json'),
    JSON.stringify({ name: 'chain-app', version: '0.0.0', dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' } }));
  writeChainSrc(chainInlineDir);
  // One descriptor spawns the always-on host; the full stage table runs (W7).
  writeChainTsconfig(chainInlineDir, [{ transform: '@rhombus-std/di.extras/ttsc' }]);
}

function runChainTtsc(dir: string): ReturnType<typeof spawnSync> {
  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8', env: goEnv() });
  if (result.status !== 0) {
    throw new Error(`ttsc failed in ${dir} (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

// The refusal compile, which is EXPECTED to exit non-zero: the envelope carrying
// the diagnostics is the result, so an empty one is the harness failing rather
// than the stage answering.
function runInferredTtsc(): Diagnostic[] {
  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: inferredDir, encoding: 'utf8', env: goEnv() });
  // A run that ends in diagnostics writes its envelope to stderr rather than stdout.
  const envelope = String(result.stdout).trim() || String(result.stderr).trim();
  if (!envelope) {
    throw new Error(`ttsc produced no envelope in ${inferredDir} (status ${result.status})`);
  }
  return (JSON.parse(envelope) as { diagnostics?: Diagnostic[]; }).diagnostics ?? [];
}

function readChainFile(dir: string, result: ReturnType<typeof spawnSync>, srcRel: string): string {
  const outFile = join(dir, 'dist', srcRel.replace(/^src\//, '').replace(/\.ts$/, '.js'));
  let lowered: string;
  try {
    lowered = readFileSync(outFile, 'utf8');
  } catch {
    const envelope = JSON.parse(String(result.stdout)) as { typescript: Record<string, string>; };
    lowered = envelope.typescript[srcRel] ?? '';
  }
  return canonQuotes(new Bun.Transpiler({ loader: 'ts' }).transformSync(lowered));
}

type Diagnostic = { file: string; category: string; code: string; messageText: string; };

/** The generated const module the sandbox's lowered files import their types from. */
function readTypeModule(dir: string): string {
  return readFileSync(join(dir, 'dist', '__typefor__.js'), 'utf8');
}

/**
 * The `Type.*` factory call the const named in `line` holds — the spelling a
 * hand-writer would have put at the call site, which the emission moved into
 * the generated module. Fails loudly when the line names no const, or the
 * module declares none by that name.
 */
function spellingIn(module: string, line: string): string {
  const referenced = /\$\w+/.exec(line);
  if (referenced === null) {
    throw new Error(`no const referenced in: ${line}`);
  }
  const name = referenced[0];
  const declared = new RegExp(`export const \\${name} = (.+);`).exec(module);
  if (declared === null) {
    throw new Error(`no const named ${name} in:\n${module}`);
  }
  return declared[1]!;
}

/**
 * The const the module declares for `spelling` — the exact `Type.*` factory call
 * a hand-writer would have spelled at the call site. Fails loudly when the
 * module declares no such const, so the spelling stays pinned byte for byte.
 */
function constFor(module: string, spelling: string): string {
  const match = new RegExp(`export const (\\$\\w+) = ${spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`).exec(module);
  if (match === null) {
    throw new Error(`no const spelled ${spelling} in:\n${module}`);
  }
  return match[1]!;
}

let chainInline = '';
let keyedInline = '';
let resolveInline = '';
let overrideInline = '';
let chainModule = '';
let inferredDiagnostics: Diagnostic[] = [];

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupChainWorkspaces();
  const inlineRun = runChainTtsc(chainInlineDir);
  chainInline = readChainFile(chainInlineDir, inlineRun, 'src/chain.ts');
  keyedInline = readChainFile(chainInlineDir, inlineRun, 'src/keyed.ts');
  resolveInline = readChainFile(chainInlineDir, inlineRun, 'src/resolve.ts');
  overrideInline = readChainFile(chainInlineDir, inlineRun, 'src/override.ts');
  // chain.ts / keyed.ts / resolve.ts / override.ts compile in the SAME sandbox,
  // so they share the one generated const module.
  chainModule = readTypeModule(chainInlineDir);

  setupInferredWorkspace();
  inferredDiagnostics = runInferredTtsc();
}, COLD_BUILD_MS);

// The authoring-time survivors that must NEVER reach emitted JS — sugar generics
// and every derivation primitive. A survivor means the loop under-lowered.
function assertNoAuthoringSurvivors(out: string): void {
  expect(out).not.toContain('add<');
  expect(out).not.toContain('addValue<');
  expect(out).not.toContain('tokenfor');
  expect(out).not.toContain('tokenof');
  // The CALL form, not the bare name: a hoisted emission's own module specifier
  // and const names carry the primitive's name as a substring.
  expect(out).not.toContain('typefor(');
  expect(out).not.toContain('typefor<');
}

function lineWith(src: string, needle: string): string | undefined {
  return src.split('\n').find((l) => l.includes(needle))?.trim();
}

describe.skipIf(!toolchainReady)('generic inline stage — registration parity (W2)', () => {
  test('a closed service type mints its token and observes the implementer beside it', () => {
    // The sugar contributes the leading service type AND the observed implementer
    // node; the lifetime the author wrote reaches the Type-taking member after
    // them, in the same order.
    const line = lineWith(chainInline, 'closed =');
    expect(line).toBeDefined();
    const logger = constFor(chainModule, 'Type.imported("ILogger", "chain-app/tokens/chain")');
    const consoleClass = constFor(chainModule, 'Type.imported("ConsoleLogger", "chain-app/tokens/chain")');
    const clock = constFor(chainModule, 'Type.imported("IClock", "chain-app/tokens/chain")');
    const consoleCtor = constFor(chainModule, `Type.ctor(${consoleClass}, [[${clock}]])`);
    expect(line).toContain(`add(${logger}, ConsoleLogger, ${consoleCtor}, "singleton")`);
    assertNoAuthoringSurvivors(chainInline);
  });

  test('a second call at the same address observes ITS implementer, not the first one', () => {
    const line = lineWith(chainInline, 'emptySig =');
    expect(line).toBeDefined();
    const logger = constFor(chainModule, 'Type.imported("ILogger", "chain-app/tokens/chain")');
    const noDepsClass = constFor(chainModule, 'Type.imported("NoDepsLogger", "chain-app/tokens/chain")');
    const noDepsCtor = constFor(chainModule, `Type.ctor(${noDepsClass}, [[]])`);
    expect(line).toContain(`add(${logger}, NoDepsLogger, ${noDepsCtor}, "singleton")`);
    assertNoAuthoringSurvivors(chainInline);
  });

  test('an open template carries its hole into both the service token and the ctor dep', () => {
    const line = lineWith(chainInline, 'open =');
    expect(line).toBeDefined();
    // The service type is the template IRepo<$1>, its hole minted as its own
    // const — a placeholder rather than a named type — and the composite
    // references it by name. The OBSERVED implementer node carries the same hole
    // inside its dependency signature.
    const hole = constFor(chainModule, 'Type.generic("1")');
    const openType = constFor(chainModule, `Type.imported("IRepo", "chain-app/tokens/chain", [${hole}])`);
    const repoClass = constFor(chainModule, 'Type.imported("ThingRepo", "chain-app/tokens/chain")');
    const storeDep = constFor(chainModule, `Type.imported("IStore", "chain-app/tokens/chain", [${hole}])`);
    const repoCtor = constFor(chainModule, `Type.ctor(${repoClass}, [[${storeDep}]])`);
    expect(line).toContain(`add(${openType}, ThingRepo, ${repoCtor})`);
    assertNoAuthoringSurvivors(chainInline);
  });

  test('Open issue 1: the sandbox resolves di.core to its source barrel (source-first)', () => {
    // The load-bearing empirical answer is the byte-parity above: the inline stage
    // substituted the sugar bodies (anchored on di.core's MERGED member symbol)
    // while di.core resolved as an external package, disproving anchor.go:26's
    // claim that inline substitution goes inert against an external di.core. This
    // pins the resolution shape it ran under: every consumer and every condition
    // resolves the source barrel — dist exists only behind publishConfig.
    const pkg = JSON.parse(readFileSync(join(DI_CORE, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(pkg.exports['.']).toBe('./src/index.ts');
  });

  test('a keyed service type composes base and key into one tag token', () => {
    assertNoAuthoringSurvivors(keyedInline);
    const line = lineWith(keyedInline, 'keyed =');
    expect(line).toBeDefined();
    // One argument, not a base plus a trailing key: the tag IS the service type,
    // and it composes the base's own const rather than re-spelling it.
    const cache = constFor(chainModule, 'Type.imported("ICache", "chain-app/tokens/keyed")');
    const keyedCache = constFor(chainModule, `Type.tag(${cache}, "redis")`);
    const redisClass = constFor(chainModule, 'Type.imported("RedisCache", "chain-app/tokens/keyed")');
    const redisCtor = constFor(chainModule, `Type.ctor(${redisClass}, [[]])`);
    expect(line).toContain(`add(${keyedCache}, RedisCache, ${redisCtor})`);
  });

  test('a cast steers the observed implementer SHAPE', () => {
    // Derivation reads the checker's type for the argument expression, so the
    // cast's one-parameter constructor signature is what the node carries — not the
    // class's own two-parameter signature. Kind stays chosen by the door; only the
    // shape moved.
    const line = lineWith(overrideInline, 'overridden =');
    expect(line).toBeDefined();
    const handler = constFor(chainModule, 'Type.imported("IHandler", "chain-app/tokens/override")');
    const req = constFor(chainModule, 'Type.imported("IReq", "chain-app/tokens/override")');
    const steered = constFor(chainModule, `Type.ctor(${handler}, [[${req}]])`);
    expect(line).toContain(`add(${handler}, Handler, ${steered})`);
    assertNoAuthoringSurvivors(overrideInline);
  });

  test('a sugar call with no type argument is refused by name, not silently derived', () => {
    // The service type is the type argument and no parameter mentions it, so an
    // omitted one has nothing to bind against. Deriving a token for `unknown` would
    // register a service nobody can ask for, so the stage refuses and says which
    // call to annotate.
    expect(inferredDiagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of inferredDiagnostics) {
      expect(diagnostic.code).toBe('INLINE_INFERRED_TYPE_ARGUMENT');
      expect(diagnostic.category).toBe('error');
      expect(diagnostic.file).toContain('inferred.ts');
    }
  });

  test('the generated module mints each distinct type once, and every lowered file imports rather than re-derives it', () => {
    const declarations = [...chainModule.matchAll(/^export const \$\w+ = (Type\.[^;]+);$/gm)].map((m) => m[1]!);
    expect(declarations.length).toBeGreaterThan(0);
    expect(new Set(declarations).size).toBe(declarations.length);

    for (const lowered of [chainInline, keyedInline, resolveInline, overrideInline]) {
      expect(lowered).toContain('from "./__typefor__.js"');
      // No factory of ANY name survives at a call site — a grep per verb would
      // go stale the next time the vocabulary gains one.
      expect(lowered).not.toContain('Type.');
    }
  });
});

describe.skipIf(!toolchainReady)('generic inline stage — lookup parity (W5)', () => {
  test('resolve<I>() lowers to the Type-taking member', () => {
    const line = lineWith(resolveInline, 'tokenful =');
    expect(line).toBeDefined();
    const thing = constFor(chainModule, 'Type.imported("IThing", "chain-app/tokens/resolve")');
    expect(line).toContain(`.resolve(${thing})`);
    expect(line).not.toContain('resolve<');
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('resolve<I>() lowers to the Type-taking member', () => {
    const line = lineWith(resolveInline, 'tryTok =');
    expect(line).toBeDefined();
    const thing = constFor(chainModule, 'Type.imported("IThing", "chain-app/tokens/resolve")');
    expect(line).toContain(`.resolve(${thing})`);
    expect(line).not.toContain('resolve<');
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('resolveMany<I>() derives the ELEMENT type, not a collection type', () => {
    // The collection is the verb's own doing; the type argument names one element,
    // so the token is the bare element type.
    const line = lineWith(resolveInline, 'many =');
    expect(line).toBeDefined();
    const thing = constFor(chainModule, 'Type.imported("IThing", "chain-app/tokens/resolve")');
    expect(line).toContain(`.resolveMany(${thing})`);
    expect(line).not.toContain('resolveMany<');
  });

  test('a type LITERAL derives its own token like any other service type', () => {
    const line = lineWith(resolveInline, 'singular =');
    expect(line).toBeDefined();
    const literal = constFor(chainModule, 'Type.typeLiteral("dev")');
    expect(line).toContain(`.resolve(${literal})`);
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('a keyed lookup mints the SAME tag token a keyed registration does', () => {
    // The identity is the whole point: registration and lookup are two halves of
    // one keyed contract, and a token that differed between them would miss.
    const cache = constFor(chainModule, 'Type.imported("ICache", "chain-app/tokens/resolve")');
    const composed = constFor(chainModule, `Type.tag(${cache}, "redis")`);
    const getLine = lineWith(resolveInline, 'keyedTok =');
    expect(getLine).toBeDefined();
    expect(getLine).toContain(`.resolve(${composed})`);

    const requiredLine = lineWith(resolveInline, 'keyedKnown =');
    expect(requiredLine).toBeDefined();
    expect(requiredLine).toContain(`.resolve(${composed})`);
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('runtime round-trip: the emitted keyed token hits a keyed registration and misses an unkeyed one', () => {
    // The text compares above prove the emitted bytes; this EXECUTES against the
    // real container, using the tag the transformer actually minted, so a keyed
    // registration and a keyed lookup are shown to meet rather than assumed to.
    const marker = { tag: 'redis-cache' };
    const base = Type.imported('ICache', 'chain-app/tokens/resolve');
    const composed = Type.tag(base, 'redis');

    let keyed: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    keyed = keyed.addValue(composed, marker);
    const keyedProvider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(keyed).build();
    expect(keyedProvider.resolve(composed)).toBe(marker);

    // An unkeyed registration of the same base does not answer the keyed lookup.
    let unkeyed: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    unkeyed = unkeyed.addValue(base, marker);
    const unkeyedProvider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(unkeyed).build();
    expect(unkeyedProvider.resolve(Type.union(composed, Type.typeLiteral(undefined)))).toBeUndefined();
  });
});

// ===========================================================================
// W4 — addOptions<T>() options witness.
//
// The addOptions<T>() sugar is no longer a bespoke stage: it is a
// di.extras.options rhombus-std inline body substituted by the inline stage,
// putting a single `typefor<T>()` in front of the verb — the bare element type,
// never a composed `IOptions<T>` wrapper: one open registration answers every
// `IOptions<…>` request, so the sugar has only its own type argument to derive.
// This witness compiles a lone `addOptions<UserOptions>()` through the REAL ttsc
// and asserts the one-argument verb over the bare options type, which is also the
// form the runtime addOptions augmentation (installed by
// @rhombus-std/options.augmentations) dispatches on.
//
// Single sandbox (no split dep graphs): the one dir wires the primitives
// descriptors to spawn the host and lists di.extras + di.extras.options in
// deps — the host's own scan activates inline + typefor and collects the
// addOptions body, and @rhombus-std/options is loaded so `IOptions` resolves.

const DI_OPTIONS = join(REPO_ROOT, 'libraries', 'di.extras.options');
const OPTIONS = join(REPO_ROOT, 'libraries', 'options');

const OPTIONS_DIR = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'options');

// The addOptions<T>() sugar face and the explicit verb come from the real
// di.extras.options declare-module merge; the di.extras sugar names ride the
// same route, so every published body resolves against the publisher's own
// declarations.
const OPTIONS_AUTHORING = `
import type { Manifest, Type } from '@rhombus-std/di.core';
import type {} from '@rhombus-std/di.extras';
import type {} from '@rhombus-std/di.extras.options';
export type __Keep = [Manifest<unknown>, Type];
export {};
`;

const OPTIONS_SOURCE = `
import type { Manifest } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';

// Force @rhombus-std/options into the program: an unimported peer would not be
// loaded, and the runtime-dispatch test below needs IOptions available.
export type __KeepOptions<T> = IOptions<T>;

interface UserOptions {
  name: string;
}

declare const services: Manifest<'singleton'>;

export const opts = services.addOptions<UserOptions>();
`;

function linkOptionsDeps(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.extras'));
  link(DI_OPTIONS, join(nm, '@rhombus-std', 'di.extras.options'));
  link(OPTIONS, join(nm, '@rhombus-std', 'options'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.extras'));
}

function setupOptionsWorkspace(): void {
  rmSync(join(OPTIONS_DIR, 'dist'), { recursive: true, force: true });
  linkOptionsDeps(OPTIONS_DIR);
  writeFileSync(join(OPTIONS_DIR, 'package.json'),
    JSON.stringify({ name: 'options-app', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*', '@rhombus-std/di.extras.options': 'workspace:*' } }));
  const src = join(OPTIONS_DIR, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'authoring.ts'), OPTIONS_AUTHORING);
  writeFileSync(join(src, 'options-app.ts'), OPTIONS_SOURCE);
  // One descriptor spawns the always-on host; the full stage table runs (W7). The
  // addOptions<T>() body comes from the di.extras.options dep via the scan.
  writeChainTsconfig(OPTIONS_DIR, [{ transform: '@rhombus-std/di.extras/ttsc' }]);
}

let optionsOut = '';
let optionsModule = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupOptionsWorkspace();
  const run = runChainTtsc(OPTIONS_DIR);
  optionsOut = readChainFile(OPTIONS_DIR, run, 'src/options-app.ts');
  optionsModule = readTypeModule(OPTIONS_DIR);
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('generic inline stage — addOptions options witness (W4)', () => {
  test('addOptions<T>() lowers to the one-argument verb over the bare options type', () => {
    const line = lineWith(optionsOut, 'opts =');
    expect(line).toBeDefined();
    // The verb names the BARE T. `IOptions` is never composed here: one open
    // registration answers every request, so the sugar has only its own type
    // argument to derive.
    expect(line).not.toContain('IOptions');
    expect(optionsOut).not.toContain('addOptions<');
    expect(optionsOut).not.toContain('tokenfor');
    expect(optionsOut).not.toContain('tokenof');
    // The verb's sole argument is a const, and the type it holds is spelled in
    // the generated module.
    const m = /^Type\.imported\("([^"]*)", "([^"]*)"\)$/.exec(spellingIn(optionsModule, line as string));
    expect(m).not.toBeNull();
    const [, name] = m as RegExpExecArray;
    // The sole argument is the app's own UserOptions type.
    expect(name).toEqual('UserOptions');
  });

  test('registry dispatch: the emitted verb resolves IOptions<T> through the real augmentation', () => {
    // Runtime-EXECUTION witness (the text test above only proves the emitted bytes).
    // It feeds the transformer's ACTUAL emitted type to a real Manifest whose
    // addOptions is installed the production way — the top-of-file
    // `import '@rhombus-std/options.augmentations'` mounts it into the OPEN
    // augmentation registry, so the call below dispatches through the installed
    // DefaultManifest proto-wrapper, not a standalone. Registering that type's
    // value and resolving IOptions over it must deliver the registered value:
    // proof the emitted type lands in the runtime slot the verb reads. Shape
    // drift would compile clean and pass the text net above, yet misregister
    // and fail HERE — the gap this test closes.
    const line = lineWith(optionsOut, 'opts =');
    const m = /^Type\.imported\("([^"]*)", "([^"]*)"\)$/.exec(spellingIn(optionsModule, line as string));
    expect(m).not.toBeNull();
    const [, name, from] = m as RegExpExecArray;
    const optionsType = Type.imported(name as string, from as string);

    interface UserOptions {
      name: string;
    }
    const value: UserOptions = { name: 'ada' };

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addValue(optionsType, value);
    services = services.addOptions(optionsType);

    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();
    const options = provider.resolve(optionsAddressType(optionsType)) as IOptions<UserOptions>;
    // IOptions<T> resolves to a value that IS the registered T.
    expect(options.value).toBe(value);
  });
});

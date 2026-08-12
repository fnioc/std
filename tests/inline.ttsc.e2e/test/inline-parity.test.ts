// Side-effect: installs `build` onto di.core's Manifest.
import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
// Side-effect import: installs the addOptions augmentation onto Manifest
// through the OPEN augmentation registry — the same production path a consumer uses.
import '@rhombus-std/options.augmentations';

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
//   1. closed        services.addClass<ILogger>(ConsoleLogger, [['app:IClock']], 'singleton')
//   2. open template services.addClass<IRepo<$<1>>>(ThingRepo, [[]])  (hole-carrying dep)
//   3. keyed         services.addClass<Keyed<ICache, 'redis'>>(RedisCache, [[]])
//
// WIRING. The chain sandbox deps {di.core, di.extras}, symlinks the authoring
// packages, and names ONE spawn descriptor. The always-on host runs its whole
// stage table: the inline stage substitutes the sugar body, which puts a
// `typefor<T>()` in front of the token-taking member, and the primitive stages
// (nameof / signatureof / keyof / valueof) lower the calls it mints. Every
// argument the author wrote after the ctor is carried through untouched — the
// sugar adds the token and nothing else.
//
// The sandbox points at the one shared TTSC_CACHE_DIR, so a sidecar built cold by
// any suite is reused warm here. di.core resolves to its dist/bundle types, so
// inline substitution is exercised against a dist-referenced receiver.

const CHAIN_ROOT = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'chain');
const chainInlineDir = join(CHAIN_ROOT, 'inline');
const inferredDir = join(CHAIN_ROOT, 'inferred');

// The type-driven authoring overloads, hand-declared as a di.core module
// augmentation so the program carries the sugar surface without pulling
// di.extras's rolled declare-module types. The signatures are the faces di.extras
// publishes, so the merged member symbols the stages anchor on are the ones a
// consumer call actually resolves to.
const AUTHORING_SOURCE = `
import type { Manifest, Signatures } from '@rhombus-std/di.core';

interface Ctor<in Args extends readonly any[] = any[], out Instance = any> {
  new(...args: Args): Instance;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = 'singleton'> {
    addClass<T>(ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): Manifest<Scopes>;
    addValue<T>(value: unknown, key?: string): Manifest<Scopes>;
  }
}

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

class ConsoleLogger implements ILogger {}
class ThingRepo {
  constructor(store: IStore<$<1>>) {
    void store;
  }
}

declare const services: Manifest<'singleton'>;

export const closed = services.addClass<ILogger>(ConsoleLogger, [['app:IClock']], 'singleton');

export const emptySig = services.addClass<ILogger>(ConsoleLogger, [[]], 'singleton');

export const open = services.addClass<IRepo<$<1>>>(ThingRepo, [[]]);
`;

// A KEYED service type. Base and key compose into ONE tag token, and the lookup
// side mints the identical token — that identity is what makes a keyed
// registration and a keyed lookup meet. Own file so the compare is isolated.
const KEYED_SOURCE = `
import type { Keyed, Manifest } from '@rhombus-std/di.core';

interface ICache {}
class RedisCache implements ICache {}

declare const services: Manifest<'singleton'>;

export const keyed = services.addClass<Keyed<ICache, 'redis'>>(RedisCache, [[]]);
`;

// A sugar call with NO type argument. The service type is the sugar's type
// argument, and no parameter mentions it, so there is nothing for the checker to
// infer it from. The stage refuses with a named diagnostic rather than deriving a
// token for `unknown` — compiled on its own, since the refusal fails the build.
const INFERRED_SOURCE = `
import type { Manifest } from '@rhombus-std/di.core';

class SelfRepo {}

declare const services: Manifest<'singleton'>;

export const self = services.addClass(SelfRepo, [[]]);
`;

// Lookup-family source (W5). The type-driven get* forms lower through the inline
// bodies to the Type-taking member: `provider.getService(typefor<T>())` and its
// two siblings, the token minted by the nameof stage. Own file so the lookup
// compare is isolated from the registration whole-file compare.
const RESOLVE_SOURCE = `
import type { Keyed } from '@rhombus-std/di.core';
import type { IServiceProvider } from '@rhombus-std/primitives';

// The tokenless get* overloads di.extras declaration-merges onto IServiceProvider,
// hand-declared here so the sandbox program carries them without wiring that
// package's types. The matcher anchors on the sugar overload at its declaration
// site, so a program holding only di.core's Type-taking base member has nothing to
// match and the call passes through with its type argument merely erased.
declare module '@rhombus-std/primitives' {
  interface IServiceProvider {
    getService<T>(): T | undefined;
    getRequiredService<T>(): T;
    getServices<T>(): Iterable<T>;
  }
}

interface IThing {}
interface ICache {}

declare const provider: IServiceProvider;

export const tokenful = provider.getRequiredService<IThing>();
export const tryTok = provider.getService<IThing>();
export const many = provider.getServices<IThing>();
// A type LITERAL is a service type like any other: it derives its own token
// rather than collapsing to the literal value.
export const singular = provider.getRequiredService<'dev'>();
// A keyed type argument composes base and key into ONE tag token — the same token
// the keyed registration mints, which is what makes the two meet at runtime.
export const keyedTok = provider.getService<Keyed<ICache, 'redis'>>();
export const keyedKnown = provider.getRequiredService<Keyed<ICache, 'redis'>>();
`;

// The signatures argument. Everything the author writes after the ctor reaches the
// token-taking member unchanged: the sugar's only job is to put the derived token
// in front of it. Own file so the pass-through is compared in isolation.
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

export const overridden = services.addClass<IHandler>(Handler, [['pkg:IReqAlt', 'pkg:ILog']]);
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
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], strict: true,
      outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false, plugins },
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
    JSON.stringify({ name: 'inferred-app', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' } }));
  writeFileSync(join(inferredDir, 'src', 'authoring.ts'), AUTHORING_SOURCE);
  writeFileSync(join(inferredDir, 'src', 'inferred.ts'), INFERRED_SOURCE);
  writeChainTsconfig(inferredDir, [{ transform: '@rhombus-std/di.extras/ttsc' }]);
}

function setupChainWorkspaces(): void {
  rmSync(join(chainInlineDir, 'dist'), { recursive: true, force: true });

  // Inline path: di.extras IN deps → the host scan activates the full stage
  // set (inline + nameof + signatureof + keyof + valueof + the resolve-family
  // primitives). The tsconfig spells the primitives descriptors explicitly so ttsc
  // has direct-discovery entries to spawn the host with; the rest arrive through
  // the scan. There is no longer a semantic (di-direct) sandbox — that stage was
  // deleted (W6p3); its output is the frozen `*.di-direct.js` golden.
  linkChainDeps(chainInlineDir);
  writeFileSync(join(chainInlineDir, 'package.json'),
    JSON.stringify({ name: 'chain-app', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' } }));
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

let chainInline = '';
let keyedInline = '';
let resolveInline = '';
let overrideInline = '';
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

  setupInferredWorkspace();
  inferredDiagnostics = runInferredTtsc();
}, COLD_BUILD_MS);

// The authoring-time survivors that must NEVER reach emitted JS — sugar generics
// and every derivation primitive. A survivor means the loop under-lowered.
function assertNoAuthoringSurvivors(out: string): void {
  expect(out).not.toContain('addClass<');
  expect(out).not.toContain('tokenfor');
  expect(out).not.toContain('tokenof');
  expect(out).not.toContain('signatureof');
  expect(out).not.toContain('signaturefor');
  expect(out).not.toContain('valueof');
  expect(out).not.toContain('keyof');
  expect(out).not.toContain('isSingular');
  expect(out).not.toContain('singularValue');
}

function lineWith(src: string, needle: string): string | undefined {
  return src.split('\n').find((l) => l.includes(needle))?.trim();
}

describe.skipIf(!toolchainReady)('generic inline stage — registration parity (W2)', () => {
  test('a closed service type mints its token and carries signature + lifetime through', () => {
    // The sugar's whole contribution is the leading token. Everything the author
    // wrote after the ctor — the signature list, the lifetime — reaches the
    // Type-taking member byte-for-byte, in the same order.
    const line = lineWith(chainInline, 'closed =');
    expect(line).toBeDefined();
    expect(line).toContain(
      'addClass(Type.named("ILogger", "chain-app/tokens/chain"), ConsoleLogger, [["app:IClock"]], "singleton")',
    );
    assertNoAuthoringSurvivors(chainInline);
  });

  test('an empty signature list survives the fixed-point loop unchanged', () => {
    // `[[]]` is a value argument the sugar never reads, so every pass of the loop
    // must leave it alone; a pass that re-visited its own output would mangle it.
    const line = lineWith(chainInline, 'emptySig =');
    expect(line).toBeDefined();
    expect(line).toContain(
      'addClass(Type.named("ILogger", "chain-app/tokens/chain"), ConsoleLogger, [[]], "singleton")',
    );
    assertNoAuthoringSurvivors(chainInline);
  });

  test('an open template carries its hole into both the service token and the ctor dep', () => {
    const line = lineWith(chainInline, 'open =');
    expect(line).toBeDefined();
    // The service type is the template IRepo<$1>, its hole minted as a placeholder
    // rather than a named type.
    expect(line).toContain('Type.named("IRepo", "chain-app/tokens/chain", [Type.placeholder("1")])');
    expect(chainInline).toContain('Type.placeholder("1")');
    assertNoAuthoringSurvivors(chainInline);
  });

  test('Open issue 1: the sandbox resolves di.core to its dist/bundle types (dist-referenced)', () => {
    // The load-bearing empirical answer is the byte-parity above: the inline stage
    // substituted the sugar bodies (anchored on di.core's MERGED member symbol)
    // while di.core resolved to its ROLLED d.ts, disproving anchor.go:26's claim
    // that inline substitution goes inert against an external/dist di.core. This
    // pins the resolution shape that makes it so.
    const distDts = join(DI_CORE, 'dist', 'bundle', 'index.d.ts');
    expect(existsSync(distDts)).toBe(true);
    const pkg = JSON.parse(readFileSync(join(DI_CORE, 'package.json'), 'utf8')) as {
      exports: Record<string, Record<string, string>>;
    };
    const dot = pkg.exports['.'];
    // A plain Bundler-resolution consumer takes the `types` condition → dist/bundle.
    expect(dot.types).toContain('dist/bundle');
    // The only src-routing conditions are di.core's OWN self-compile hooks
    // (`source` needs an opt-in customCondition; `di-core-source` is package-unique),
    // never a path a consumer program without those conditions would take.
    for (const [cond, target] of Object.entries(dot)) {
      if (target.includes('/src/')) {
        expect(['source', 'di-core-source']).toContain(cond);
      }
    }
  });

  test('a keyed service type composes base and key into one tag token', () => {
    assertNoAuthoringSurvivors(keyedInline);
    const line = lineWith(keyedInline, 'keyed =');
    expect(line).toBeDefined();
    // One argument, not a base plus a trailing key: the tag IS the service type.
    expect(line).toContain(
      'addClass(Type.tag(Type.named("ICache", "chain-app/tokens/keyed"), "redis"), RedisCache, [[]])',
    );
  });

  test('the signatures argument reaches the member exactly as written', () => {
    const line = lineWith(overrideInline, 'overridden =');
    expect(line).toBeDefined();
    expect(line).toContain(
      'addClass(Type.named("IHandler", "chain-app/tokens/override"), Handler, [["pkg:IReqAlt", "pkg:ILog"]])',
    );
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
});

describe.skipIf(!toolchainReady)('generic inline stage — lookup parity (W5)', () => {
  test('getRequiredService<I>() lowers to the Type-taking member', () => {
    const line = lineWith(resolveInline, 'tokenful =');
    expect(line).toBeDefined();
    expect(line).toContain('.getRequiredService(Type.named("IThing", "chain-app/tokens/resolve"))');
    expect(line).not.toContain('getRequiredService<');
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('getService<I>() lowers to the Type-taking member', () => {
    const line = lineWith(resolveInline, 'tryTok =');
    expect(line).toBeDefined();
    expect(line).toContain('.getService(Type.named("IThing", "chain-app/tokens/resolve"))');
    expect(line).not.toContain('getService<');
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('getServices<I>() derives the ELEMENT type, not a collection type', () => {
    // The collection is the verb's own doing; the type argument names one element,
    // so the token is the bare element type.
    const line = lineWith(resolveInline, 'many =');
    expect(line).toBeDefined();
    expect(line).toContain('.getServices(Type.named("IThing", "chain-app/tokens/resolve"))');
    expect(line).not.toContain('getServices<');
  });

  test('a type LITERAL derives its own token like any other service type', () => {
    const line = lineWith(resolveInline, 'singular =');
    expect(line).toBeDefined();
    expect(line).toContain('.getRequiredService(Type.typeLiteral("dev"))');
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('a keyed lookup mints the SAME tag token a keyed registration does', () => {
    // The identity is the whole point: registration and lookup are two halves of
    // one keyed contract, and a token that differed between them would miss.
    const composed = 'Type.tag(Type.named("ICache", "chain-app/tokens/resolve"), "redis")';
    const getLine = lineWith(resolveInline, 'keyedTok =');
    expect(getLine).toBeDefined();
    expect(getLine).toContain(`.getService(${composed})`);

    const requiredLine = lineWith(resolveInline, 'keyedKnown =');
    expect(requiredLine).toBeDefined();
    expect(requiredLine).toContain(`.getRequiredService(${composed})`);
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('runtime round-trip: the emitted keyed token hits a keyed registration and misses an unkeyed one', () => {
    // The text compares above prove the emitted bytes; this EXECUTES against the
    // real container, using the tag the transformer actually minted, so a keyed
    // registration and a keyed lookup are shown to meet rather than assumed to.
    const marker = { tag: 'redis-cache' };
    const base = Type.named('ICache', 'chain-app/tokens/resolve');
    const composed = Type.tag(base, 'redis');

    let keyed: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    keyed = keyed.addValue(composed, marker);
    expect(keyed.build().getService(composed)).toBe(marker);

    // An unkeyed registration of the same base does not answer the keyed lookup.
    let unkeyed: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    unkeyed = unkeyed.addValue(base, marker);
    expect(unkeyed.build().getService(composed)).toBeUndefined();
  });
});

// ===========================================================================
// W4 — addOptions<T>() options witness.
//
// The addOptions<T>() sugar is no longer a bespoke stage: it is a
// di.extras.options rhombus-std inline body substituted by the inline stage, its
// composed `IOptions<T>` wrapper token + bare `T` element token lowered by the
// tokenfor (nameof) stage's composed-generic derivation. This witness compiles a
// lone `addOptions<UserOptions>()` through the REAL ttsc and asserts the two-token
// verb: the wrapper is `@rhombus-std/options:IOptions<element>` over the SAME
// element token the second argument carries (relationally locked), byte-identical
// to the retired dioptionstransform stage's lowering (whose idempotence test
// pinned exactly this shape before it was deleted). There is no di-direct oracle
// to compare against — that stage is gone — so the witness pins the canonical
// two-token SHAPE, which is also the form the runtime addOptions augmentation
// (installed by @rhombus-std/options.augmentations) dispatches on.
//
// Single sandbox (no split dep graphs): with no oracle path there is nothing to
// keep the inline stage out of, so the one dir wires the primitives descriptors
// to spawn the host and lists di.extras + di.extras.options in deps —
// the host's own scan activates inline + nameof + di + valueof and collects the
// addOptions body, and @rhombus-std/options is loaded so the wrapper base resolves.

const DI_OPTIONS = join(REPO_ROOT, 'libraries', 'di.extras.options');
const OPTIONS = join(REPO_ROOT, 'libraries', 'options');

const OPTIONS_DIR = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'options');

// The addOptions<T>() sugar overload + the explicit two-token verb, hand-declared
// as a di.core module augmentation (like the chain's AUTHORING_SOURCE), so the
// program carries the sugar surface without pulling di.extras.options's rolled
// declare-module types. The generic signatures mirror di.extras.options's
// src/augment.ts + options.augmentations so the merged member symbol the inline
// resolver anchors on is the real face.
const OPTIONS_AUTHORING = `
import type { Manifest, Type } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = 'singleton'> {
    addOptions<T>(): Manifest<Scopes>;
    addOptions(token: Type | string, tToken: Type | string): Manifest<Scopes>;
  }
}
export {};
`;

const OPTIONS_SOURCE = `
import type { Manifest } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';

// Force @rhombus-std/options into the program so the composed wrapper base
// (@rhombus-std/options:IOptions) resolves — the tokenfor stage scans the loaded
// source files for it, and an unimported peer would not be loaded.
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
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*',
        '@rhombus-std/di.extras.options': 'workspace:*' } }));
  const src = join(OPTIONS_DIR, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'authoring.ts'), OPTIONS_AUTHORING);
  writeFileSync(join(src, 'options-app.ts'), OPTIONS_SOURCE);
  // One descriptor spawns the always-on host; the full stage table runs (W7). The
  // addOptions<T>() body comes from the di.extras.options dep via the scan.
  writeChainTsconfig(OPTIONS_DIR, [{ transform: '@rhombus-std/di.extras/ttsc' }]);
}

let optionsOut = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupOptionsWorkspace();
  const run = runChainTtsc(OPTIONS_DIR);
  optionsOut = readChainFile(OPTIONS_DIR, run, 'src/options-app.ts');
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('generic inline stage — addOptions options witness (W4)', () => {
  test('addOptions<T>() lowers to the relationally-locked two-token verb', () => {
    const line = lineWith(optionsOut, 'opts =');
    expect(line).toBeDefined();
    // Two-token verb over the peered options package's IOptions — no sugar type
    // argument and neither token primitive (the wrapper's tokenfor, the element's
    // tokenof) survives.
    expect(line).toContain('addOptions("@rhombus-std/options:IOptions<');
    expect(optionsOut).not.toContain('addOptions<');
    expect(optionsOut).not.toContain('tokenfor');
    expect(optionsOut).not.toContain('tokenof');
    const m = /addOptions\("(@rhombus-std\/options:IOptions<[^"]*>)", "([^"]*)"\)/.exec(line as string);
    expect(m).not.toBeNull();
    const [, wrapper, element] = m as RegExpExecArray;
    // Relational lock: the wrapper is IOptions<element> over the SAME element token
    // the second argument carries (both minted from the one element derivation).
    expect(wrapper).toEqual(`@rhombus-std/options:IOptions<${element}>`);
    // The element is the app's own UserOptions type.
    expect(element).toContain('UserOptions');
  });

  test('registry dispatch: the emitted two-token verb resolves IOptions<T> through the real augmentation', () => {
    // Runtime-EXECUTION witness (the text tests above only prove the emitted bytes).
    // It feeds the transformer's ACTUAL emitted (wrapper, element) tokens to a real
    // Manifest whose addOptions is installed the production way — the
    // top-of-file `import '@rhombus-std/options.augmentations'` mounts it into the
    // OPEN augmentation registry, so the call below dispatches through the installed
    // DefaultManifest proto-wrapper, not a standalone. Registering the element
    // token's value and resolving the wrapper must deliver an IOptions<T> over that
    // exact value: proof the two emitted tokens land in the right runtime slots
    // (wrapper = registration key, element = the wrapped dependency). Argument-order
    // or shape drift would compile clean and pass every text net above, yet misregister
    // and fail HERE — the gap this test closes.
    const line = lineWith(optionsOut, 'opts =');
    const m = /addOptions\("(@rhombus-std\/options:IOptions<[^"]*>)", "([^"]*)"\)/.exec(line as string);
    expect(m).not.toBeNull();
    const [, wrapper, element] = m as RegExpExecArray;

    interface UserOptions {
      name: string;
    }
    const value: UserOptions = { name: 'ada' };

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addValue(element, value);
    services = services.addOptions(wrapper, element);

    const options = services.build().getRequiredService(Type.from(wrapper)) as IOptions<UserOptions>;
    // The wrapper resolves an IOptions<T> whose value IS the element-registered T.
    expect(options.value).toBe(value);
  });
});

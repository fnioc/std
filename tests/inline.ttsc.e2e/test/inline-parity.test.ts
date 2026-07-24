import { ServiceManifest } from '@rhombus-std/di';
import type { IOptions } from '@rhombus-std/options';
import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
// Side-effect import: installs the addOptions augmentation onto ServiceManifestClass
// through the OPEN augmentation registry — the same production path a consumer uses.
import '@rhombus-std/options.augmentations';

// Production-path e2e for the generic single-expression inline stage — the sole
// registration/resolution lowering path now that the bespoke di / di_options /
// config stages are deleted (W6p3). It drives the REAL ttsc over temp projects
// wiring the inline + primitive descriptors (all resolve to the one owner Go
// host), then asserts every authoring form lowers to the hand-writable output and
// reproduces the FROZEN di-direct oracle byte-for-byte.
//
//   1. the isService<T>() sugar is inlined and lowered to isService("<token>"),
//      with no tokenfor and no authoring-form generics surviving; and
//   2. BYTE PARITY against the FROZEN di-direct golden. The two bespoke domain
//      stages that used to serve as a live oracle are gone; their pre-deletion
//      output was captured into the checked-in testdata/*.di-direct.js goldens
//      (never self-blessed from the inline path), and the inline pipeline must
//      reproduce them exactly. The deliberately-divergent keyed forms (§98) read
//      the divergent field from the golden and reunite it.
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
// The inline stage reads di.core's REAL src (its rhombus.inline entry + the
// out-of-barrel src/inline.ts body), so the real di.core is symlinked, not mocked.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');

// The di-direct oracle (the deleted di / di_options / config stages, plus the
// pre-§98 keyed forms) no longer runs: its byte-output was FROZEN into these
// checked-in goldens BEFORE the W6p3 deletion, captured from the semantic sandbox
// while it still existed (never self-blessed from the inline path). The inline
// pipeline is then proven to reproduce them here. For a golden the two paths
// deliberately diverge on (keyed), the assertions below read the divergent field
// from the golden and reunite it, exactly as the live semantic sandbox did.
const TESTDATA = join(import.meta.dir, 'testdata');
function golden(name: string): string {
  return readFileSync(join(TESTDATA, name), 'utf8');
}
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const DI_CORE = join(REPO_ROOT, 'libraries', 'di.core');
const DI_TRANSFORMER = join(REPO_ROOT, 'libraries', 'di.transformer');
const PRIMITIVES = join(REPO_ROOT, 'libraries', 'primitives');
const PRIMITIVES_TRANSFORMER = join(REPO_ROOT, 'libraries', 'primitives.transformer');

// Outside the repo tree (see the header: an enclosing package.json re-roots token
// derivation), keyed by the worktree dir name so concurrent sessions don't collide.
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'inline');
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

const APP_SOURCE = `
import type { IServiceProvider } from "@rhombus-std/di.core";

// The sugar overload the di.transformer declaration-merges onto IServiceQuery —
// hand-declared here so the program carries it without wiring the transformer's
// own types (the merge target is the real di.core IServiceQuery).
declare module "@rhombus-std/di.core" {
  interface IServiceQuery {
    isService<T>(): boolean;
  }
}

interface ILogger {}
declare const provider: IServiceProvider<string>;

export const known = provider.isService<ILogger>();
`;

// Both compilations live in ONE project dir under ONE node_modules, so they
// share the plugin cache (see the file header). Each tsconfig differs only in
// its plugin list and its outDir, so their emit never collides.
function writeTsconfig(name: string, outDir: string, plugins: Array<{ transform: string; }>): void {
  writeFileSync(
    join(projDir, name),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2022'],
        strict: true,
        outDir: outDir,
        rootDir: 'src',
        skipLibCheck: true,
        noEmitOnError: false,
        plugins,
      },
      include: ['src/**/*'],
    }),
  );
}

function setupWorkspace(): void {
  const nm = join(projDir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  mkdirSync(join(projDir, 'src'), { recursive: true });
  rmSync(join(projDir, 'dist-inline'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.transformer'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.transformer'));

  // The consumer must depend on di.transformer so the collector reaches its
  // rhombus.inline ServiceQueryInline entry (the isService<T>() body) — with the
  // di stage deleted (W6p3), that inline body is the ONLY path that lowers the
  // tokenless isService, so it must be collected. di.core carries the receiver type.
  writeFileSync(
    join(projDir, 'package.json'),
    JSON.stringify({ name: 'inline-e2e-app', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.transformer': 'workspace:*' } }),
  );
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);

  writeTsconfig('tsconfig.inline.json', 'dist-inline', [
    { transform: '@rhombus-std/primitives.transformer/inline-ttsc' },
    { transform: '@rhombus-std/primitives.transformer/ttsc' },
    { transform: '@rhombus-std/di.transformer/ttsc' },
  ]);
}

function lower(tsconfig: string, outDir: string): string {
  const result = spawnSync('node', [TTSC, '-p', tsconfig], { cwd: projDir, encoding: 'utf8', env: goEnv() });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  let lowered: string;
  try {
    lowered = readFileSync(join(projDir, outDir, 'app.js'), 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    lowered = envelope.typescript['src/app.ts'] ?? '';
  }
  return new Bun.Transpiler({ loader: 'ts' }).transformSync(lowered);
}

let withInline = '';
let withoutInline = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupWorkspace();
  withInline = lower('tsconfig.inline.json', 'dist-inline');
  // The di-direct oracle output is frozen (the semantic sandbox is gone with the di
  // stage). The inline pipeline must reproduce it byte-for-byte.
  withoutInline = golden('pilot.di-direct.js');
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('generic inline stage — isService pilot', () => {
  test('isService<T>() is inlined and lowered to a token, no sugar or tokenfor survives', () => {
    expect(withInline).toContain('isService("');
    expect(withInline).not.toContain('isService<');
    expect(withInline).not.toContain('tokenfor');
  });

  test('byte parity: inline path vs di semantic path emit the identical output', () => {
    // Both tsconfigs compile the IDENTICAL source; the pilot changes the lowering
    // PATH (inline stage → synthetic tokenof → di) but never the emitted bytes, so
    // the two whole transpiled outputs must be identical. Whole-output equality is
    // strictly stronger than comparing only the isService line — it also pins
    // import elision, declare-module handling, and surrounding whitespace.
    const line = (src: string) => src.split('\n').find((l) => l.includes('isService('))?.trim();
    // Readable failure hint first: the load-bearing line.
    expect(line(withInline)).toBeDefined();
    expect(line(withInline)).toEqual(line(withoutInline));
    // The full byte-parity guarantee the pilot advertises. Only the NON-keyed
    // isService is exercised here: under §98 the keyed query form deliberately
    // DIVERGES from the di-direct oracle (inline composes the single base#key token;
    // di-direct still emits the raw Keyed<...> alias — the port gap §98 fixes), so
    // keyed isService moves to the resolve-family suite with documented-semantics
    // and runtime-round-trip assertions rather than di-direct byte parity.
    expect(withInline).toEqual(withoutInline);
  });
});

// ===========================================================================
// W2 — full registration-CHAIN parity (closed chain / open template / keyed).
//
// The pilot exercises one flat `isService<T>()`; this extends the harness to the
// three-deep registration chain the di-direct stage lowers today, each lowered
// through BOTH pipelines and byte-compared:
//
//   1. closed chain  services.addClass<ILogger>(ConsoleLogger)
//                       .withSignature<[]>().as<'singleton'>()
//   2. open template services.addClass<IRepo<$<1>>>(ThingRepo)  (hole-carrying dep)
//   3. keyed         services.addClass<Keyed<ICache, 'redis'>>(RedisCache)
//
// WIRING — why two project dirs, not the pilot's one-dir/two-tsconfig shape.
// The chain needs the `valueof` stage (`.as<Scope>()` → `this.as(valueof<Scope>())`
// in the sugar body). `valueof` has NO explicit descriptor: it activates ONLY
// through the host's declare-by-depending dependency scan, which reads
// di.transformer's package.json `ttsc.stages` (["di","valueof"]). But the host
// UNIONs that scan with the tsconfig plugin list, and the scan walks the WHOLE
// transitive dep graph — so a di.transformer dependency drags in primitives.
// transformer's stages too (inline + nameof + signatureof + keyof + mergesynth).
// A single shared package.json would therefore force `inline` onto BOTH tsconfigs
// and collapse the di-direct oracle. Splitting the dep graphs keeps them distinct:
//
//   inline/   deps {di.core, di.transformer} → scan activates the FULL set,
//             INCLUDING the `di` stage.
//   semantic/ deps {di.core} only → di.core declares no stages so the scan is
//             empty; tsconfig plugins [nameof, di.transformer/ttsc] pick the
//             di-DIRECT lowering with NO inline stage. di.transformer is symlinked
//             for its descriptor but kept OUT of package.json so the scan ignores
//             its stages.
//
// ISOLATION GAP — read before trusting the closed-chain / open-template parity.
// The `di` stage is CO-ACTIVE in the inline/ dir (the scan drags it in alongside
// valueof, and there is no way to keep valueof without it: valueof has no
// standalone descriptor, and the collector reads di.transformer's sugar BODIES and
// its di/valueof STAGES from the ONE dep walk — CollectProject — so a dir that has
// the bodies inline needs to peel necessarily also has the di stage). In practice
// inline runs first in the host's stage-table order and strips the type-args before
// di's declaration-site matcher can claim the call, so di settles as a no-op — but
// this suite CANNOT prove that: for the closed chain and the open template the two
// pipelines are byte-IDENTICAL by design, so a regression that stopped inline
// peeling the `.withSignature`/`.as` continuations would be silently covered by di
// lowering the whole chain in one deep walk, and the parity would still pass. So
// for those two cases the byte-parity here is a PRODUCTION-PATH agreement + whole-
// file regression net (dist-referenced di.core, real ttsc, real descriptors), NOT
// evidence of which stage did the peeling. The inline stage is proven IN ISOLATION
// — di stage genuinely absent — at the Go level, where the pipeline is composed by
// hand with no di transform: TestChainSettlesThroughInlinePrimitivesOnly
// (looprunner_test.go, the exact closed chain under the loop),
// TestAsDecoupleInlinePipelineMatchesDiDirect (the `.as` continuation) and
// TestOpenTemplateInlinePipelineMatchesDiDirect (the open template). The KEYED case
// below is the one discriminator this suite provides itself (inline and di diverge
// on keyed output, so parity there DOES pin that inline won the race).
//
// Both point at the one shared TTSC_CACHE_DIR, so the sidecar the pilot already
// built cold is reused warm here. di.core resolves to its dist/bundle types in
// both dirs (Open issue 1: does inline substitution work against a dist-referenced
// di.core? — answered empirically by the parity below).

const CHAIN_ROOT = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'chain');
const chainInlineDir = join(CHAIN_ROOT, 'inline');

// The token-free authoring overloads, hand-declared as a di.core module
// augmentation — mirroring how the isService pilot hand-declares `isService<T>()`,
// so the program carries the sugar surface without pulling di.transformer's rolled
// declare-module types (which risk issue #225's INLINE_ROGUE_DUPLICATE). The
// generic signatures are copied verbatim from di.transformer's `src/augment.ts`
// so the merged member symbols the transforms anchor on are the real faces.
const AUTHORING_SOURCE = `
import type { AddChain, Ctor, IServiceManifest, Slot } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    addClass(ctor: Ctor<any[], unknown>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    addClass<I>(ctor: Ctor<any[], I>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    addClass<I>(ctor: Ctor<any[], I>, overrides: ReadonlyArray<string | undefined>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    addValue(value: unknown): IServiceManifest<Scopes>;
    addValue<I>(value: I): IServiceManifest<Scopes>;
  }
  interface IWithSignatureBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    withSignature<T extends readonly any[]>(): AddChain<S, Exclude<Slots, 'signatures'>, Gated>;
  }
  interface IAsBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    as<Scope extends S>(): AddChain<S, Exclude<Slots, 'scope'>, Gated>;
  }
  // The tokenless resolve family (W5): resolve on IRequiredResolver,
  // resolveAsync/tryResolve on IResolver — the faces di-direct anchors on and the
  // inline ResolverInline bodies target.
  interface IRequiredResolver {
    resolve<T>(): T;
    resolve<F extends (...args: any[]) => any>(): ReturnType<F>;
  }
  interface IResolver {
    resolveAsync<T>(): Promise<T>;
    tryResolve<T>(): T | undefined;
  }
  // The tokenless query predicate (§98 keyed form): isService on IServiceQuery,
  // the face the inline ServiceQueryInline body targets.
  interface IServiceQuery {
    isService<T>(): boolean;
  }
}

export {};
`;

// Cases 1 + 2 — both lower to plain runtime registration calls whose bytes match
// the di-direct lowering exactly (the value arg is a bare identifier, so there is
// no instantiation-type-argument stripping to diverge on). Kept in one file so a
// whole-file byte compare pins import elision + surrounding text, like the pilot.
const CHAIN_SOURCE = `
import type { $, IServiceManifest } from '@rhombus-std/di.core';

interface ILogger {}
interface IClock {}
interface IRepo<T> {}
interface IStore<T> {}

class ConsoleLogger implements ILogger {}
class SelfRepo {
  constructor(clock: IClock) {
    void clock;
  }
}
class ThingRepo {
  constructor(store: IStore<$<1>>) {
    void store;
  }
}

declare const services: IServiceManifest<'singleton'>;

export const closed = services.addClass<ILogger>(ConsoleLogger).withSignature<[IClock]>().as<'singleton'>();

export const emptySig = services.addClass<ILogger>(ConsoleLogger).withSignature<[]>().as<'singleton'>();

// W3 no-type-arg SELF-registration: the token derives from the VALUE (SelfRepo's
// own instance type), not an explicit <I>. Lowers to the plain 3-arg form.
export const self = services.addClass(SelfRepo);

export const open = services.addClass<IRepo<$<1>>>(ThingRepo);
`;

// Case 3 — keyed. The inline pipeline keeps the two halves SPLIT (tokenfor gives
// the bare base in arg0; keyof gives the key literal in the arg-5 KEY slot, behind
// the `void 0` scope placeholder), while the di-direct stage COMPOSES `base#key`
// into arg0. So the keyed emit is NOT byte-identical across paths — instead the
// two halves must reunite onto the di-direct token (mirrors the Go-level
// TestKeyedInlinePipelineComposesBaseKey). Own file so the whole-file compare of
// cases 1+2 is not disturbed by this deliberate divergence.
const KEYED_SOURCE = `
import type { IServiceManifest, Keyed } from '@rhombus-std/di.core';

interface ICache {}
class RedisCache implements ICache {}

declare const services: IServiceManifest<'singleton'>;

export const keyed = services.addClass<Keyed<ICache, 'redis'>>(RedisCache);
`;

// Value-argument self-registration (W3 tokenof). addValue registers an ALREADY-
// BUILT value under its OWN type — so a CALLABLE value (a factory) must tokenize
// as the function itself (…:makeThing), NOT its return type (…:Thing). That is the
// case where the raw-type tokenof (which the addValue self body uses) diverges from
// the produced-type tokenfor: were the body on tokenfor, valueFn would derive
// …:Thing and break parity with the di-direct raw-type addValue lowering. A class
// REFERENCE (valueClass) tokenizes as its constructor type, which carries the
// class symbol. Own file so the deliberate raw semantics is compared in isolation,
// like KEYED_SOURCE.
const VALUE_SOURCE = `
import type { IServiceManifest } from '@rhombus-std/di.core';

interface Thing {}
class ValueRepo {}
declare function makeThing(): Thing;

declare const services: IServiceManifest<'singleton'>;

export const valueFn = services.addValue(makeThing);

export const valueClass = services.addValue(ValueRepo);
`;

// Resolve-family source (W5). The tokenless resolve / resolveAsync / tryResolve
// forms lower through the inline ResolverInline bodies (isSingular / singularValue
// / tokenfor) OR the di-direct rewriteResolve, which must agree: a NON-singular T
// resolves to the token form `provider.resolve("<token>")`, and a SINGULAR T
// short-circuits to the value literal itself (di.core's Rule-2), the dead token arm
// pruned by the fold. Own file so the resolve compare is isolated from the
// registration whole-file compare.
const RESOLVE_SOURCE = `
import type { IResolver, Keyed } from '@rhombus-std/di.core';

interface IThing {}
interface ICache {}

declare const provider: IResolver;

export const tokenful = provider.resolve<IThing>();
export const asyncTok = provider.resolveAsync<IThing>();
export const tryTok = provider.tryResolve<IThing>();
export const singular = provider.resolve<'dev'>();
// §94 factory forms. resolve<F>() with F a function type lowers to
// resolveFactory(returnToken, [paramTokens]); a no-arg factory drops the array.
export const factoryTok = provider.resolve<(a: IThing) => ICache>();
export const factoryNoArg = provider.resolve<() => IThing>();
// §98 keyed forms. resolve/tryResolve carry a tail key parameter → split base + key;
// isService/resolveAsync are key-less → the single composed base#key token.
export const keyedTok = provider.resolve<Keyed<ICache, 'redis'>>();
export const keyedKnown = provider.isService<Keyed<ICache, 'redis'>>();
export const keyedAsync = provider.resolveAsync<Keyed<ICache, 'redis'>>();
`;

// Registration OVERRIDE source (§99). `addClass<I>(Class, overrides)` lowers
// through the inline path to `addClass(token, Class, overrideSignatures(
// signatureof(Class), overrides))` — a RUNTIME merge helper the inline stage
// materializes an import for — DELIBERATELY diverging from di-direct's compile-time
// merge (a `[[...]]` literal). Own file so its runtime-callee shape is asserted in
// isolation; the overrideSignatures merge semantics are unit-tested in di.test.
const OVERRIDE_SOURCE = `
import type { IServiceManifest } from '@rhombus-std/di.core';

interface IReq {}
interface ILog {}
interface IHandler {}
class Handler implements IHandler {
  constructor(req: IReq, log: ILog) {
    void req;
    void log;
  }
}

declare const services: IServiceManifest<'singleton'>;

export const overridden = services.addClass<IHandler>(Handler, ['pkg:IReqAlt']);
`;

function writeChainSrc(dir: string): void {
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'authoring.ts'), AUTHORING_SOURCE);
  writeFileSync(join(src, 'chain.ts'), CHAIN_SOURCE);
  writeFileSync(join(src, 'keyed.ts'), KEYED_SOURCE);
  writeFileSync(join(src, 'value.ts'), VALUE_SOURCE);
  writeFileSync(join(src, 'resolve.ts'), RESOLVE_SOURCE);
  writeFileSync(join(src, 'override.ts'), OVERRIDE_SOURCE);
}

function writeChainTsconfig(dir: string, plugins: Array<{ transform: string; }>): void {
  writeFileSync(
    join(dir, 'tsconfig.json'),
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
        plugins,
      },
      include: ['src/**/*'],
    }),
  );
}

function linkChainDeps(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  // di.core + di.transformer + the primitives packages are symlinked in EVERY dir
  // (the di.transformer descriptor the semantic tsconfig references must resolve
  // even though di.transformer is absent from the semantic package.json deps).
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.transformer'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.transformer'));
}

function setupChainWorkspaces(): void {
  rmSync(join(chainInlineDir, 'dist'), { recursive: true, force: true });

  // Inline path: di.transformer IN deps → the host scan activates the full stage
  // set (inline + nameof + signatureof + keyof + valueof + the resolve-family
  // primitives). The tsconfig spells the primitives descriptors explicitly so ttsc
  // has direct-discovery entries to spawn the host with; the rest arrive through
  // the scan. There is no longer a semantic (di-direct) sandbox — that stage was
  // deleted (W6p3); its output is the frozen `*.di-direct.js` golden.
  linkChainDeps(chainInlineDir);
  writeFileSync(
    join(chainInlineDir, 'package.json'),
    JSON.stringify({
      name: 'chain-app',
      version: '0.0.0',
      dependencies: {
        '@rhombus-std/di.core': 'workspace:*',
        '@rhombus-std/di.transformer': 'workspace:*',
      },
    }),
  );
  writeChainSrc(chainInlineDir);
  writeChainTsconfig(chainInlineDir, [
    { transform: '@rhombus-std/primitives.transformer/inline-ttsc' },
    { transform: '@rhombus-std/primitives.transformer/ttsc' },
    { transform: '@rhombus-std/primitives.transformer/signatureof-ttsc' },
    { transform: '@rhombus-std/primitives.transformer/keyof-ttsc' },
  ]);
}

function runChainTtsc(dir: string): ReturnType<typeof spawnSync> {
  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8', env: goEnv() });
  if (result.status !== 0) {
    throw new Error(`ttsc failed in ${dir} (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result;
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
  return new Bun.Transpiler({ loader: 'ts' }).transformSync(lowered);
}

let chainInline = '';
let chainSemantic = '';
let keyedInline = '';
let keyedSemantic = '';
let valueInline = '';
let valueSemantic = '';
let resolveInline = '';
let resolveSemantic = '';
let overrideInline = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupChainWorkspaces();
  const inlineRun = runChainTtsc(chainInlineDir);
  chainInline = readChainFile(chainInlineDir, inlineRun, 'src/chain.ts');
  keyedInline = readChainFile(chainInlineDir, inlineRun, 'src/keyed.ts');
  valueInline = readChainFile(chainInlineDir, inlineRun, 'src/value.ts');
  resolveInline = readChainFile(chainInlineDir, inlineRun, 'src/resolve.ts');
  overrideInline = readChainFile(chainInlineDir, inlineRun, 'src/override.ts');
  // The di-direct oracle output for each source is frozen (semantic sandbox gone).
  chainSemantic = golden('chain.di-direct.js');
  keyedSemantic = golden('keyed.di-direct.js');
  valueSemantic = golden('value.di-direct.js');
  resolveSemantic = golden('resolve.di-direct.js');
}, COLD_BUILD_MS);

// The authoring-time survivors that must NEVER reach emitted JS — sugar generics
// and every derivation primitive. A survivor means the loop under-lowered.
function assertNoAuthoringSurvivors(out: string): void {
  expect(out).not.toContain('addClass<');
  expect(out).not.toContain('withSignature<');
  expect(out).not.toContain('.as<');
  expect(out).not.toContain('tokenfor');
  expect(out).not.toContain('tokenof');
  expect(out).not.toContain('keyedtokenfor');
  expect(out).not.toContain('signatureof');
  expect(out).not.toContain('signaturefor');
  expect(out).not.toContain('valueof');
  expect(out).not.toContain('keyof');
  expect(out).not.toContain('isSingular');
  expect(out).not.toContain('singularValue');
  expect(out).not.toContain('isFactory');
  expect(out).not.toContain('returntokenfor');
  expect(out).not.toContain('paramtokensfor');
}

function lineWith(src: string, needle: string): string | undefined {
  return src.split('\n').find((l) => l.includes(needle))?.trim();
}

describe.skipIf(!toolchainReady)('generic inline stage — registration chain parity (W2)', () => {
  test('closed chain: addClass<I>(C).withSignature<[]>().as<"singleton">() lowers to the value form', () => {
    // The three-deep sugar chain peels to a plain registration call: the token, the
    // ctor, its derived signature, then the fluent `.withSignature()` / `.as(
    // "singleton")` continuations survive as their own value-arg calls (survive-not-
    // fold parity). NOTE (see the ISOLATION GAP block above): the `di` stage is co-
    // active in this dir and independently lowers the identical chain, so the byte-
    // parity below is a production-path agreement + regression net, not proof inline
    // did the peeling — that isolation lives in the Go
    // TestChainSettlesThroughInlinePrimitivesOnly (no di stage).
    const line = lineWith(chainInline, 'closed =');
    expect(line).toBeDefined();
    expect(line).toContain('addClass("');
    expect(line).toContain('.as("singleton")');
    assertNoAuthoringSurvivors(chainInline);
    // Byte parity with the di-direct lowering of the same chain.
    expect(lineWith(chainSemantic, 'closed =')).toEqual(line);
  });

  test('open template: addClass<IRepo<$<1>>>(ThingRepo) carries the "$1" open token + hole dep', () => {
    // Same co-active-di caveat as the closed chain (ISOLATION GAP block above): di
    // could lower this identical open template alone, so parity is agreement, not
    // proof of which stage peeled. Inline-in-isolation for the open template is the
    // Go TestOpenTemplateInlinePipelineMatchesDiDirect (no di stage).
    const line = lineWith(chainInline, 'open =');
    expect(line).toBeDefined();
    // The service token is the open template IRepo<$1> and the ctor dep carries
    // the same hole (IStore<$1>) — the load-bearing "$1" text the derivation mints.
    expect(line).toContain('$1');
    expect(chainInline).toContain('IRepo<$1>');
    expect(chainInline).toContain('IStore<$1>');
    // Byte parity with di-direct (the bare ThingRepo value has no instantiation
    // type args to strip, so the whole call matches, not just the token).
    expect(lineWith(chainSemantic, 'open =')).toEqual(line);
  });

  test('self-registration: addClass(SelfRepo) derives the token from the value, byte-parity with di-direct', () => {
    // W3 no-type-arg self-registration. The inline path routes through
    // ServiceManifestSelfInline (value-arg tokenfor + signatureof), the di-direct
    // path through inferredRegType — both derive SelfRepo's own instance token and
    // its ctor dependency signature, so the lowered call is byte-identical. Same
    // co-active-di caveat as the closed chain (di could lower a no-type-arg addClass
    // alone), so this is production-path agreement + regression net; the Go
    // TestSelfInlineAddClassMatchesDiDirect proves inline-in-isolation.
    const line = lineWith(chainInline, 'self =');
    expect(line).toBeDefined();
    expect(line).toContain('addClass("');
    // Self-registration is unkeyed and lifetime-unchosen: the plain 3-arg form,
    // no scope placeholder or trailing key.
    expect(line).not.toContain('void 0');
    expect(line).not.toContain('undefined');
    assertNoAuthoringSurvivors(chainInline);
    // The token is SelfRepo's own instance token, and the ctor dep is IClock.
    expect(line).toContain('SelfRepo');
    expect(chainInline).toContain('IClock');
    // Byte parity with the di-direct inferred lowering of the same call.
    expect(lineWith(chainSemantic, 'self =')).toEqual(line);
  });

  test('whole-file byte parity: inline pipeline ≡ di-direct for the closed + open chain', () => {
    // Strictly stronger than the per-line checks — pins import elision, the
    // declare-module handling, class emit, and surrounding whitespace across the
    // whole file. Only the keyed case (its own file) legitimately diverges.
    expect(chainInline).toEqual(chainSemantic);
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

  test('keyed: addClass<Keyed<ICache, "redis">>(RedisCache) reunites base + key onto the di token', () => {
    // DISCRIMINATING case (see the ISOLATION GAP block above): unlike the closed
    // chain and open template — where inline and di emit byte-identical output, so
    // parity cannot tell which stage peeled — inline and di DIVERGE on keyed output.
    // Inline keeps the halves split (bare base in arg0, "redis" in the arg-5 KEY slot
    // behind the scope placeholder); di composes `base#redis` into arg0. So the
    // `expect(inlineBase).not.toContain('#')` assertion below would FAIL if di had
    // produced the keyed token — which makes this the one case in this suite that
    // proves inline, not di, won the addClass race in the SAME compilation despite di
    // being co-active. (Mirrors the Go TestKeyedInlinePipelineComposesBaseKey.)
    assertNoAuthoringSurvivors(keyedInline);
    const inlineLine = lineWith(keyedInline, 'keyed =');
    const diLine = lineWith(keyedSemantic, 'keyed =');
    expect(inlineLine).toBeDefined();
    expect(diLine).toBeDefined();

    // Inline keeps the halves split: bare base in arg0, key literal "redis" in the
    // arg-5 KEY slot behind the scope placeholder. ttsc emits the placeholder as
    // `void 0`; Bun.Transpiler normalizes it to `undefined` in the readback.
    expect(keyedInline).toContain(', undefined, "redis")');
    const inlineBase = /addClass\("([^"]*)"/.exec(inlineLine as string)?.[1];
    const diToken = /addClass\("([^"]*)"/.exec(diLine as string)?.[1];
    expect(inlineBase).toBeDefined();
    expect(diToken).toBeDefined();
    expect(inlineBase).not.toContain('#');
    // Di-direct composes the whole base#key into arg0…
    expect(diToken).toEndWith('#redis');
    // …and the two halves reunite exactly onto it.
    expect(`${inlineBase}#redis`).toEqual(diToken);
  });

  test("value self-registration: addValue(fn) tokenizes the fn's OWN type via tokenof, byte-parity with di-direct", () => {
    // W3 value-argument self-registration through the REAL ServiceManifestSelfInline
    // body (end-to-end, unlike the Go tier's fixture body). addValue registers an
    // already-built value under its OWN type, so a CALLABLE value (makeThing) must
    // tokenize as the function itself (…:makeThing), NOT its call-signature return
    // type (…:Thing). This is the exact tokenfor→tokenof divergence: the raw-type
    // tokenof holds parity with di-direct's raw-type addValue lowering, where the
    // produced-type tokenfor would have unwrapped to …:Thing and diverged.
    const fnLine = lineWith(valueInline, 'valueFn =');
    expect(fnLine).toBeDefined();
    expect(fnLine).toContain('addValue("');
    expect(fnLine).toContain(':makeThing"');
    expect(fnLine).not.toContain(':Thing"');
    // A value carries no deps and no lifetime — the plain 2-arg addValue form.
    expect(fnLine).not.toContain('[[');
    assertNoAuthoringSurvivors(valueInline);
    // A class REFERENCE tokenizes as its constructor type (the class symbol).
    expect(lineWith(valueInline, 'valueClass =')).toContain(':ValueRepo"');
    // Whole-file byte parity: the inline tokenof path equals the di-direct raw-type
    // addValue lowering for both the callable and the class-reference value.
    expect(valueSemantic).toEqual(valueInline);
  });

  test('override registration: addClass<I>(C, overrides) lowers to a runtime overrideSignatures merge (§99)', () => {
    // §99: `addClass<I>(C, overrides)` merges the sparse overrides over the derived
    // signature at RUNTIME, inside the body, via the di.core `overrideSignatures`
    // helper — DELIBERATELY diverging from di-direct's compile-time `[[...]]` merge.
    // The helper is a body-imported RUNTIME callee: it SURVIVES lowering as an
    // ordinary call, and the inline stage MATERIALIZES its di.core import.
    const line = lineWith(overrideInline, 'overridden =');
    expect(line).toBeDefined();
    expect(line).toContain('.addClass("');
    // The runtime merge helper survives, applied to the derived signature array and
    // the authored overrides array (quote/spacing normalized by Bun.Transpiler).
    expect(line).toContain('overrideSignatures(');
    expect(line).toContain('pkg:IReqAlt');
    expect(line).toContain('[[');
    // The derived signature carries the ctor's two dependency tokens.
    expect(overrideInline).toContain('IReq');
    expect(overrideInline).toContain('ILog');
    // The inline stage materialized the runtime helper's di.core value import.
    const importLine = overrideInline.split('\n').find((l) =>
      l.includes('import') && l.includes('overrideSignatures') && l.includes('@rhombus-std/di.core')
    );
    expect(importLine).toBeDefined();
    // No authoring-form primitive survives (overrideSignatures is a runtime callee,
    // not a lowered primitive, so it is expected to remain).
    assertNoAuthoringSurvivors(overrideInline);
    expect(overrideInline).not.toContain('addClass<');
  });

  test('empty-tuple withSignature<[]>() is loop-idempotent (lowers to zero-arg .withSignature())', () => {
    // Loop-idempotence regression pin (was a test.todo). The EMPTY-tuple
    // `withSignature<[]>()` lowers to a zero-argument `.withSignature()` — the empty
    // tuple makes `...signaturefor<[]>()` spread nothing. A subsequent fixed-point
    // pass then re-visits that factory-built, position-less call; without the
    // synthetic-node guard in inlinetransform's tryInline it re-matched the
    // zero-value-arg sugar overload, failed RecoverTypeArguments, and ttsc exited
    // non-zero with a spurious INLINE_INFERRED_TYPE_ARGUMENT despite byte-correct
    // emit. With the guard the synthetic call is a clean non-match: ttsc succeeds
    // (this suite's beforeAll runChainTtsc would THROW on the non-zero exit
    // otherwise), the loop settles, and the emitted continuation is the bare
    // zero-arg call. (Go-level pin: TestEmptyTupleWithSignatureDoesNotReMatchOwnOutput.)
    const line = lineWith(chainInline, 'emptySig =');
    expect(line).toBeDefined();
    expect(line).toContain('addClass("');
    expect(line).toContain('.withSignature()');
    expect(line).toContain('.as("singleton")');
    assertNoAuthoringSurvivors(chainInline);
    // Byte parity with the di-direct lowering of the same empty-tuple chain.
    expect(lineWith(chainSemantic, 'emptySig =')).toEqual(line);
  });
});

describe.skipIf(!toolchainReady)('generic inline stage — resolve family parity (W5)', () => {
  test('tokenful resolve<I>() lowers to resolve("<token>"), inline ≡ di-direct', () => {
    const line = lineWith(resolveInline, 'tokenful =');
    expect(line).toBeDefined();
    expect(line).toContain('.resolve("');
    expect(line).toContain('IThing');
    expect(line).not.toContain('resolve<');
    // Byte parity with the di-direct rewriteResolve lowering of the same call.
    expect(lineWith(resolveSemantic, 'tokenful =')).toEqual(line);
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('resolveAsync<I>() / tryResolve<I>() keep their method name, inline ≡ di-direct', () => {
    const asyncLine = lineWith(resolveInline, 'asyncTok =');
    expect(asyncLine).toBeDefined();
    expect(asyncLine).toContain('.resolveAsync("');
    expect(lineWith(resolveSemantic, 'asyncTok =')).toEqual(asyncLine);

    const tryLine = lineWith(resolveInline, 'tryTok =');
    expect(tryLine).toBeDefined();
    expect(tryLine).toContain('.tryResolve("');
    expect(lineWith(resolveSemantic, 'tryTok =')).toEqual(tryLine);
  });

  test('singular resolve<"dev">() short-circuits to the value literal (Rule-2), inline ≡ di-direct', () => {
    const line = lineWith(resolveInline, 'singular =');
    expect(line).toBeDefined();
    // The whole resolve call collapses to the value itself — no resolve call, no
    // token — proving the fold pruned the tokenful dead branch AND its tokenfor.
    expect(line).toContain('"dev"');
    expect(line).not.toContain('.resolve(');
    expect(line).not.toContain('isSingular');
    expect(line).not.toContain('singularValue');
    // Byte parity with di-direct's Rule-2 singular short-circuit.
    expect(lineWith(resolveSemantic, 'singular =')).toEqual(line);
  });

  test('factory resolve<F>() lowers to resolveFactory(returnToken, [paramTokens]), inline ≡ di-direct (§94)', () => {
    // A function-type argument is not singular and IS a factory, so the nested body
    // ternary folds to `this.resolveFactory(returntokenfor<F>(), paramtokensfor<F>())`.
    // The param-carrying factory keeps the param-token array; the no-arg factory
    // elides it (di.core's bare `resolveFactory(token)` form). Byte-identical to the
    // di-direct rename + param-token array.
    const withParam = lineWith(resolveInline, 'factoryTok =');
    expect(withParam).toBeDefined();
    expect(withParam).toContain('.resolveFactory(');
    expect(withParam).toContain('[');
    expect(withParam).not.toContain('resolve<');
    expect(lineWith(resolveSemantic, 'factoryTok =')).toEqual(withParam);

    const noArg = lineWith(resolveInline, 'factoryNoArg =');
    expect(noArg).toBeDefined();
    expect(noArg).toContain('.resolveFactory(');
    // No-arg factory: the trailing param-token array is elided.
    expect(noArg).not.toContain('[');
    expect(lineWith(resolveSemantic, 'factoryNoArg =')).toEqual(noArg);
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('keyed resolve<Keyed<ICache, "redis">>() splits into base token + key arg (§98)', () => {
    // §98 keyed resolve: `resolve` carries a tail key parameter, so the body passes
    // the bare BASE token `tokenfor<T>()` plus `keyof<T>()`, lowering to the split
    // pair `resolve("<base>", "redis")` — di.core composes `base#key` at runtime.
    // This DELIBERATELY diverges from the di-direct oracle, whose lowerResolveCall
    // still emits the raw `Keyed<...>` alias token (the port gap §98 fixes — that
    // token never matched a keyed registration). So this asserts the documented
    // split form, NOT byte parity with the semantic path; the runtime round-trip
    // below proves it actually resolves a keyed registration.
    const line = lineWith(resolveInline, 'keyedTok =');
    expect(line).toBeDefined();
    expect(line).not.toContain('resolve<');
    expect(line).not.toContain('Keyed<');
    const m = /\.resolve\("([^"]*)", "redis"\)/.exec(line as string);
    expect(m).not.toBeNull();
    const base = (m as RegExpExecArray)[1];
    expect(base).toContain('ICache');
    expect(base).not.toContain('#');
    assertNoAuthoringSurvivors(resolveInline);
  });

  test('keyed isService / resolveAsync carry the single composed base#key token (§98)', () => {
    // §98 key-less query verbs: `isService` and `resolveAsync` take one token and no
    // key parameter, so the body derives the SINGLE composed `base#key` token via
    // `keyedtokenfor<T>()`. Both diverge from the di-direct oracle (raw alias), so
    // this asserts the composed form; the round-trip below proves it round-trips.
    const knownLine = lineWith(resolveInline, 'keyedKnown =');
    expect(knownLine).toBeDefined();
    expect(knownLine).not.toContain('isService<');
    expect(knownLine).not.toContain('Keyed<');
    const km = /\.isService\("([^"]*)"\)/.exec(knownLine as string);
    expect(km).not.toBeNull();
    expect((km as RegExpExecArray)[1]).toContain('ICache#redis');

    const asyncLine = lineWith(resolveInline, 'keyedAsync =');
    expect(asyncLine).toBeDefined();
    expect(asyncLine).not.toContain('resolveAsync<');
    expect(asyncLine).not.toContain('Keyed<');
    const am = /\.resolveAsync\("([^"]*)"\)/.exec(asyncLine as string);
    expect(am).not.toBeNull();
    expect((am as RegExpExecArray)[1]).toContain('ICache#redis');
  });

  test('runtime round-trip: keyed resolve / isService / resolveAsync hit a keyed registration, miss an unkeyed one', async () => {
    // Runtime-EXECUTION witness (the text tests above only prove the emitted bytes,
    // per the §98 decision: round-trip tests must EXECUTE the lowered JS). The base
    // token comes from the keyed resolve line's arg0, the composed token from the
    // keyed isService line — the transformer's ACTUAL emitted tokens. A keyed
    // service registered under the composed token must: answer `isService(composed)`
    // true, `resolve(base, "redis")` (which di.core composes to `base#key`) the
    // registered value, and `resolveAsync(composed)` the same value. An UNKEYED-only
    // registration of the same base must answer the keyed probe FALSE — the exact
    // mismatch §98 fixes (the pre-§98 raw-alias / brand-stripped forms could not).
    const base =
      (/\.resolve\("([^"]*)", "redis"\)/.exec(lineWith(resolveInline, 'keyedTok =') as string) as RegExpExecArray)[1];
    const composed =
      (/\.isService\("([^"]*)"\)/.exec(lineWith(resolveInline, 'keyedKnown =') as string) as RegExpExecArray)[1];
    expect(composed).toBe(`${base}#redis`);

    const marker = { tag: 'redis-cache' };

    // Keyed registration lands under the composed base#key token.
    let keyed = new ServiceManifest<'singleton'>();
    keyed = keyed.addValue(composed, marker);
    const keyedProvider = keyed.build().createScope('singleton');
    expect(keyedProvider.isService(composed)).toBe(true);
    expect(keyedProvider.resolve(base, 'redis')).toBe(marker);
    expect(await keyedProvider.resolveAsync(composed)).toBe(marker);

    // Unkeyed-only registration of the same base: the keyed probe misses.
    let unkeyed = new ServiceManifest<'singleton'>();
    unkeyed = unkeyed.addValue(base, marker);
    const unkeyedProvider = unkeyed.build().createScope('singleton');
    expect(unkeyedProvider.isService(composed)).toBe(false);
  });
});

// ===========================================================================
// W4 — addOptions<T>() options witness.
//
// The addOptions<T>() sugar is no longer a bespoke stage: it is a
// di.transformer.options rhombus.inline body substituted by the inline stage, its
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
// to spawn the host and lists di.transformer + di.transformer.options in deps —
// the host's own scan activates inline + nameof + di + valueof and collects the
// addOptions body, and @rhombus-std/options is loaded so the wrapper base resolves.

const DI_OPTIONS = join(REPO_ROOT, 'libraries', 'di.transformer.options');
const OPTIONS = join(REPO_ROOT, 'libraries', 'options');

const OPTIONS_DIR = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'options');

// The addOptions<T>() sugar overload + the explicit two-token verb, hand-declared
// as a di.core module augmentation (like the chain's AUTHORING_SOURCE), so the
// program carries the sugar surface without pulling di.transformer.options's rolled
// declare-module types. The generic signatures mirror di.transformer.options's
// src/augment.ts + options.augmentations so the merged member symbol the inline
// resolver anchors on is the real face.
const OPTIONS_AUTHORING = `
import type { AddChain, Token } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    addOptions<T>(): AddChain<Scopes, 'scope' | 'key', false>;
    addOptions(token: Token, tToken: Token): AddChain<Scopes, 'scope' | 'key', false>;
  }
}
export {};
`;

const OPTIONS_SOURCE = `
import type { IServiceManifest } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';

// Force @rhombus-std/options into the program so the composed wrapper base
// (@rhombus-std/options:IOptions) resolves — the tokenfor stage scans the loaded
// source files for it, and an unimported peer would not be loaded.
export type __KeepOptions<T> = IOptions<T>;

interface UserOptions {
  name: string;
}

declare const services: IServiceManifest<'singleton'>;

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
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.transformer'));
  link(DI_OPTIONS, join(nm, '@rhombus-std', 'di.transformer.options'));
  link(OPTIONS, join(nm, '@rhombus-std', 'options'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.transformer'));
}

function setupOptionsWorkspace(): void {
  rmSync(join(OPTIONS_DIR, 'dist'), { recursive: true, force: true });
  linkOptionsDeps(OPTIONS_DIR);
  writeFileSync(
    join(OPTIONS_DIR, 'package.json'),
    JSON.stringify({
      name: 'options-app',
      version: '0.0.0',
      dependencies: {
        '@rhombus-std/di.core': 'workspace:*',
        '@rhombus-std/di.transformer': 'workspace:*',
        '@rhombus-std/di.transformer.options': 'workspace:*',
      },
    }),
  );
  const src = join(OPTIONS_DIR, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'authoring.ts'), OPTIONS_AUTHORING);
  writeFileSync(join(src, 'options-app.ts'), OPTIONS_SOURCE);
  writeChainTsconfig(OPTIONS_DIR, [
    { transform: '@rhombus-std/primitives.transformer/inline-ttsc' },
    { transform: '@rhombus-std/primitives.transformer/ttsc' },
    { transform: '@rhombus-std/primitives.transformer/signatureof-ttsc' },
    { transform: '@rhombus-std/primitives.transformer/keyof-ttsc' },
  ]);
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
    // ServiceManifest whose addOptions is installed the production way — the
    // top-of-file `import '@rhombus-std/options.augmentations'` mounts it into the
    // OPEN augmentation registry, so the call below dispatches through the installed
    // ServiceManifestClass proto-wrapper, not a standalone. Registering the element
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

    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(element, value);
    services = services.addOptions(wrapper, element).as('singleton');

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<UserOptions>>(wrapper);
    // The wrapper resolves an IOptions<T> whose value IS the element-registered T.
    expect(options.value).toBe(value);
  });
});

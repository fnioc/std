import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the generic single-expression inline stage. It drives
// the REAL ttsc over a temp project wiring the inline + tokenfor + di descriptors
// (all three resolve to the one owner Go host), then asserts:
//
//   1. the isService<T>() sugar is inlined and lowered to isService("<token>"),
//      with no tokenfor and no authoring-form generics surviving; and
//   2. BYTE PARITY — the same source compiled with the inline stage present vs
//      absent (tokenfor+di only, where the di semantic stage lowers isService
//      itself) emits the identical isService line. The pilot changes the path,
//      never the output.
//
// The two compilations run in ONE per-worktree project dir OUTSIDE the repo tree
// (~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>, off the per-user-quota tmpfs
// /tmp; it must sit outside any enclosing package.json or ttsc re-roots the
// fixture's token derivation to that package) with two tsconfigs
// (tsconfig.inline.json / tsconfig.semantic.json), and BOTH point ttsc at the
// single shared plugin cache (TTSC_CACHE_DIR, see goEnv). This matters: ttsc's
// plugin cache is resolved per project root, so an unpinned cache that lands
// under each project's own node_modules would build the SAME Go sidecar afresh
// (multi-minute cold compile, and a timeout-kill then abandons a build lock the
// next run must reclaim). One shared, content-keyed cache → the sidecar builds
// once cold per machine and every later compilation is warm. This mirrors the
// di.transformer.ttsc.e2e harness.
//
// The inline stage reads di.core's REAL src (its rhombus.inline entry + the
// out-of-barrel src/inline.ts body), so the real di.core is symlinked, not
// mocked. Toolchain pinning mirrors that sibling harness.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
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
  rmSync(join(projDir, 'dist-semantic'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.transformer'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.transformer'));

  // The consumer must depend on di.core so the collector reaches its
  // rhombus.inline entry.
  writeFileSync(
    join(projDir, 'package.json'),
    JSON.stringify({ name: 'inline-e2e-app', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*' } }),
  );
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);

  writeTsconfig('tsconfig.inline.json', 'dist-inline', [
    { transform: '@rhombus-std/primitives.transformer/inline-ttsc' },
    { transform: '@rhombus-std/primitives.transformer/ttsc' },
    { transform: '@rhombus-std/di.transformer/ttsc' },
  ]);
  writeTsconfig('tsconfig.semantic.json', 'dist-semantic', [
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
  // First compilation pays the one cold sidecar build; the second reuses it warm
  // through the shared project-local plugin cache.
  withInline = lower('tsconfig.inline.json', 'dist-inline');
  withoutInline = lower('tsconfig.semantic.json', 'dist-semantic');
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('generic inline stage — isService pilot', () => {
  test('isService<T>() is inlined and lowered to a token, no sugar or tokenfor survives', () => {
    expect(withInline).toContain('isService("');
    expect(withInline).not.toContain('isService<');
    expect(withInline).not.toContain('tokenfor');
  });

  test('byte parity: inline path vs di semantic path emit the identical output', () => {
    // Both tsconfigs compile the IDENTICAL source; the pilot changes the lowering
    // PATH (inline stage → synthetic tokenfor → di) but never the emitted bytes, so
    // the two whole transpiled outputs must be identical. Whole-output equality is
    // strictly stronger than comparing only the isService line — it also pins
    // import elision, declare-module handling, and surrounding whitespace.
    const line = (src: string) => src.split('\n').find((l) => l.includes('isService('))?.trim();
    // Readable failure hint first: the load-bearing line.
    expect(line(withInline)).toBeDefined();
    expect(line(withInline)).toEqual(line(withoutInline));
    // The full byte-parity guarantee the pilot advertises.
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
const chainSemanticDir = join(CHAIN_ROOT, 'semantic');

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
    addValue(value: unknown): IServiceManifest<Scopes>;
    addValue<I>(value: I): IServiceManifest<Scopes>;
  }
  interface IWithSignatureBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    withSignature<T extends readonly any[]>(): AddChain<S, Exclude<Slots, 'signatures'>, Gated>;
  }
  interface IAsBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    as<Scope extends S>(): AddChain<S, Exclude<Slots, 'scope'>, Gated>;
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

function writeChainSrc(dir: string): void {
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'authoring.ts'), AUTHORING_SOURCE);
  writeFileSync(join(src, 'chain.ts'), CHAIN_SOURCE);
  writeFileSync(join(src, 'keyed.ts'), KEYED_SOURCE);
  writeFileSync(join(src, 'value.ts'), VALUE_SOURCE);
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
  rmSync(join(chainSemanticDir, 'dist'), { recursive: true, force: true });

  // Inline path: di.transformer IN deps → the host scan activates the full stage
  // set (inline + nameof + signatureof + keyof + valueof + di). The tsconfig
  // spells the primitives descriptors explicitly so ttsc has direct-discovery
  // entries to spawn the host with; di + valueof arrive through the scan.
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

  // Semantic (di-direct) path: di.core ONLY in deps → empty scan → NO inline. The
  // tsconfig selects the di-direct lowering explicitly. di.transformer is linked
  // for the descriptor but withheld from package.json so its stages stay unscanned.
  linkChainDeps(chainSemanticDir);
  writeFileSync(
    join(chainSemanticDir, 'package.json'),
    JSON.stringify({
      name: 'chain-app',
      version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*' },
    }),
  );
  writeChainSrc(chainSemanticDir);
  writeChainTsconfig(chainSemanticDir, [
    { transform: '@rhombus-std/primitives.transformer/ttsc' },
    { transform: '@rhombus-std/di.transformer/ttsc' },
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

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupChainWorkspaces();
  const inlineRun = runChainTtsc(chainInlineDir);
  const semanticRun = runChainTtsc(chainSemanticDir);
  chainInline = readChainFile(chainInlineDir, inlineRun, 'src/chain.ts');
  chainSemantic = readChainFile(chainSemanticDir, semanticRun, 'src/chain.ts');
  keyedInline = readChainFile(chainInlineDir, inlineRun, 'src/keyed.ts');
  keyedSemantic = readChainFile(chainSemanticDir, semanticRun, 'src/keyed.ts');
  valueInline = readChainFile(chainInlineDir, inlineRun, 'src/value.ts');
  valueSemantic = readChainFile(chainSemanticDir, semanticRun, 'src/value.ts');
}, COLD_BUILD_MS);

// The authoring-time survivors that must NEVER reach emitted JS — sugar generics
// and every derivation primitive. A survivor means the loop under-lowered.
function assertNoAuthoringSurvivors(out: string): void {
  expect(out).not.toContain('addClass<');
  expect(out).not.toContain('withSignature<');
  expect(out).not.toContain('.as<');
  expect(out).not.toContain('tokenfor');
  expect(out).not.toContain('tokenof');
  expect(out).not.toContain('signatureof');
  expect(out).not.toContain('signaturefor');
  expect(out).not.toContain('valueof');
  expect(out).not.toContain('keyof');
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

import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the signatureof primitive, plus the deps-free
// `addValue<I>(value)` sugar riding the same inline path. It drives the REAL
// ttsc over a temp project TWO ways over the IDENTICAL source, then asserts
// they emit byte-identical output:
//
//   inline path   — inline + tokenfor + signatureof + di. The type-driven
//     `addClass<I>(C)` / `addFactory<I>(fn)` sugar bodies (di.extras's
//     rhombus.inline entries) substitute to `this.addClass(tokenfor<I>(), C,
//     signatureof(C))`; tokenfor
//     lowers the token, signatureof lowers the dependency-signature array, and
//     the di stage leaves the resulting 3-argument `addClass(...)` untouched.
//     `addValue<I>(value)` substitutes to `this.addValue(tokenfor<I>(), value)`
//     — no `signatureof`, since a value carries no deps — and tokenfor alone
//     lowers it to the 2-argument `addValue("token", value)`.
//   semantic path — tokenfor + di. The di registration stage lowers the SAME
//     `addClass<I>(C)` / `addValue<I>(value)` directly to their explicit-token forms.
//
// The load-bearing guarantee is that the signatureof array (and, for
// `addValue`, the bare token) is byte-identical to what the di stage
// synthesizes for the same value: the new inline(+signatureof) lowering
// changes the PATH, never the emitted bytes. This mirrors the inline.ttsc.e2e
// isService pilot, extended to the value-argument signatureof primitive and a
// non-trivial (dependency-carrying) signature, plus the deps-free addValue form.
//
// Toolchain pinning, the single shared plugin cache, and the one-project-dir /
// two-tsconfig layout all mirror that sibling harness; see its header for why.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const DI_CORE = join(REPO_ROOT, 'libraries', 'di.core');
const DI_TRANSFORMER = join(REPO_ROOT, 'libraries', 'di.extras');
const PRIMITIVES = join(REPO_ROOT, 'libraries', 'primitives');
const PRIMITIVES_TRANSFORMER = join(REPO_ROOT, 'libraries', 'primitives.extras');

// Outside the repo tree — the sandbox must sit outside any enclosing package.json
// or ttsc re-roots its token derivation to that package; keyed by the worktree dir
// name so concurrent sessions don't collide (see the inline.ttsc.e2e header).
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'signatureof');
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

// Pin the Go build scratch and the content-keyed plugin cache to the shared home
// dir (off the per-user-quota tmpfs /tmp), so the sidecar builds once per machine
// and every suite/worktree reuses it. Default-if-unset for CI/shell.
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

// The type-driven sugar overloads are hand-declared here (as the inline.ttsc.e2e
// pilot hand-declares isService<T>) so the program carries them without wiring
// the transformer's own types — the merge target is the real di.core
// IServiceManifestBase, and the parameter NAMES (ctor / factory) match the inline
// bodies' so the structural overload discriminator resolves each call to the
// sugar overload. A class with a real constructor dependency (IDep) and a factory
// with a real parameter dependency give a NON-TRIVIAL signature array, so parity
// pins the actual slot derivation, not just an empty `[[]]`.
const APP_SOURCE = `
import type { IAsBuilder, IServiceManifest } from "@rhombus-std/di.core";

// Minimal local constructor / factory types, so the source is self-contained
// (no @rhombus-toolkit/func resolution needed). The overload discriminator reads
// parameter NAMES, not types, so these stand in for the real ones.
type Ctor<A extends any[] = any[], R = unknown> = new (...args: A) => R;
type Func<A extends any[] = any[], R = unknown> = (...args: A) => R;

declare module "@rhombus-std/di.core" {
  interface IServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    addClass<I>(ctor: Ctor<any[], I>): IAsBuilder<Scopes>;
    addFactory<I>(factory: Func<any[], I>): IAsBuilder<Scopes>;
    addValue<I>(value: I): void;
  }
}

interface IDep {}
interface IFoo {}
interface IBar {}
interface IBaz {}

class Foo implements IFoo {
  constructor(dep: IDep) { void dep; }
}
class BarImpl implements IBar {
  constructor(dep: IDep) { void dep; }
}

declare const services: IServiceManifest<"singleton">;
declare const bazValue: IBaz;

// Top-level registration statements: the di registration stage lowers
// registrations that appear as top-level expression statements, so the semantic
// (di-only) comparison path exercises the same shape the inline path does.
services.addClass<IFoo>(Foo);
services.addFactory<IBar>((dep: IDep) => new BarImpl(dep));
services.addValue<IBaz>(bazValue);
`;

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
  rmSync(join(projDir, 'dist-bundle'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.extras'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.extras'));

  // The consumer must depend on di.core (the type ANCHOR the inline entries name)
  // AND di.extras (which now owns the rhombus.inline publish list + the
  // signatureof primitive), so the inline collector walks to both.
  writeFileSync(
    join(projDir, 'package.json'),
    // A package name WITHOUT "tokenfor"/"signatureof" substrings so the derived
    // tokens (which embed the package name) don't collide with the primitive-call
    // survival assertions below.
    JSON.stringify({
      name: 'di-sig-app',
      version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' },
    }),
  );
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);

  writeTsconfig('tsconfig.inline.json', 'dist-inline', [
    { transform: '@rhombus-std/primitives.extras/inline-ttsc' },
    { transform: '@rhombus-std/primitives.extras/ttsc' },
    { transform: '@rhombus-std/primitives.extras/signatureof-ttsc' },
    { transform: '@rhombus-std/di.extras/ttsc' },
  ]);
  writeTsconfig('tsconfig.semantic.json', 'dist-semantic', [
    { transform: '@rhombus-std/primitives.extras/ttsc' },
    { transform: '@rhombus-std/di.extras/ttsc' },
  ]);
  // The PRESET path: ONE descriptor — di.core's `./ttsc` bundle — instead of the
  // four primitive-stage transforms the inline tsconfig enumerates. The owner
  // binary expands `rhombusstd_di_bundle` into inline -> tokenfor -> signatureof ->
  // di in canonical order, so a consumer never lists the stages by hand.
  writeTsconfig('tsconfig.bundle.json', 'dist-bundle', [
    { transform: '@rhombus-std/di.core/ttsc' },
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
let withBundle = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupWorkspace();
  withInline = lower('tsconfig.inline.json', 'dist-inline');
  withoutInline = lower('tsconfig.semantic.json', 'dist-semantic');
  withBundle = lower('tsconfig.bundle.json', 'dist-bundle');
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('signatureof primitive — addClass / addFactory / addValue sugar', () => {
  test('the sugar is lowered: string token (+ signature array where deps exist), no generics or primitives survive', () => {
    // addClass / addFactory lowered to a 3-arg call carrying a token and a signature
    // array; addValue lowered to a bare 2-arg token + value call (no deps).
    expect(withInline).toContain('.addClass("');
    expect(withInline).toContain('.addFactory("');
    expect(withInline).toContain('.addValue("');
    expect(withInline).not.toContain('addClass<');
    expect(withInline).not.toContain('addFactory<');
    expect(withInline).not.toContain('addValue<');
    // No un-lowered primitive CALL survives (assert the call form, not a bare
    // substring, which could appear inside a derived token string).
    expect(withInline).not.toContain('tokenfor<');
    expect(withInline).not.toContain('tokenfor(');
    expect(withInline).not.toContain('signatureof(');
  });

  test('byte parity: inline+signatureof path vs di semantic path emit the identical output', () => {
    // Both tsconfigs compile the IDENTICAL source; the pilot changes the lowering
    // PATH (inline -> synthetic tokenfor + signatureof) but never the emitted bytes.
    // Whole-output equality also pins import elision, the derived signature array,
    // and surrounding whitespace.
    const addLine = (src: string) => src.split('\n').find((l) => l.includes('.addClass('))?.trim();
    const addValueLine = (src: string) => src.split('\n').find((l) => l.includes('.addValue('))?.trim();
    expect(addLine(withInline)).toBeDefined();
    expect(addLine(withInline)).toEqual(addLine(withoutInline));
    expect(addValueLine(withInline)).toBeDefined();
    expect(addValueLine(withInline)).toEqual(addValueLine(withoutInline));
    expect(withInline).toEqual(withoutInline);
  });

  test('preset bundle: the single di.core/ttsc descriptor emits the identical output', () => {
    // A consumer that wires ONLY `@rhombus-std/di.core/ttsc` (the preset) — never
    // the four primitive-stage transforms — gets the same ordered lowering: the
    // owner binary expands the bundle name into inline -> tokenfor -> signatureof ->
    // di. Byte-identity with the hand-enumerated inline path proves the preset is a
    // pure convenience over the manual stage list, not a behavior change.
    expect(withBundle).not.toBe('');
    expect(withBundle).toEqual(withInline);
  });
});

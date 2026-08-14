import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the registration authoring surface. It drives the
// REAL ttsc over a temp project TWICE over the IDENTICAL source — through two
// DIFFERENT spawn descriptors for the SAME always-on host — then asserts they
// emit byte-identical output:
//
//   The type-driven `addClass<I>(C)` / `addFactory<I>(fn)` sugar bodies
//   (di.extras's rhombus-std inline entries) substitute their address argument
//   via typefor, forwarding the rest positionally, so the sugar half never
//   spells an implementation type of its own. That half is covered separately
//   below by a genuine SOURCE-WRITTEN `typefor<typeof C>()` third argument, the
//   shape a hand-writer reaches for directly.
//
// The load-bearing guarantee for the sugar half is descriptor independence:
// the whole always-on stage table runs regardless of which descriptor spawned
// the host, so the two emissions are byte-identical. The sibling
// inline.ttsc.e2e suite covers the address derivation itself; this one covers
// the deps-free addValue form plus, in the second describe block below, the
// implementation-type derivation over a dependency-carrying value.
//
// Toolchain pinning, the single shared plugin cache, and the one-project-dir /
// two-tsconfig layout all mirror the inline.ttsc.e2e harness; see its header.

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
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'registration');
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

// The type-driven sugar overloads are hand-declared here so the program carries
// them without wiring the transformer's own types — the merge target is the real di.core
// Manifest, and the parameter NAMES (ctor / factory) match the inline
// bodies' so the structural overload discriminator resolves each call to the
// sugar overload. A class with a real constructor dependency (IDep) and a factory
// with a real parameter dependency give a NON-TRIVIAL signature array, so parity
// pins the actual slot derivation, not just an empty `[[]]`.
const APP_SOURCE = `
import type { Manifest } from "@rhombus-std/di.core";

// Minimal local constructor / factory types, so the source is self-contained
// (no @rhombus-toolkit/func resolution needed). The overload discriminator reads
// parameter NAMES, not types, so these stand in for the real ones.
type Ctor<A extends any[] = any[], R = unknown> = new (...args: A) => R;
type Func<A extends any[] = any[], R = unknown> = (...args: A) => R;

declare module "@rhombus-std/di.core" {
  interface Manifest<Scopes extends string> {
    addClass<I>(ctor: Ctor<any[], I>): Manifest<Scopes>;
    addFactory<I>(factory: Func<any[], I>): Manifest<Scopes>;
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

declare const services: Manifest<"singleton">;
declare const bazValue: IBaz;

// Top-level registration statements: the inline stage substitutes the sugar
// bodies for registrations that appear as top-level expression statements, so both
// spawn-descriptor lowerings exercise the same shape.
services.addClass<IFoo>(Foo);
services.addFactory<IBar>((dep: IDep) => new BarImpl(dep));
services.addValue<IBaz>(bazValue);
`;

// HAND_SOURCE is the genuine hand-writer's path: an EXPLICIT implementation type
// as the third argument to the REAL (unmodified) di.core Manifest.addClass verb —
// no sugar, no inline substitution, no local declare-module override. The
// addClass<T>() sugar above forwards its own arguments positionally after the
// address, so APP_SOURCE alone never derives an implementation type.
const HAND_SOURCE = `
import type { Manifest } from "@rhombus-std/di.core";
import { typefor } from "@rhombus-std/primitives.extras";

interface IClock {}
interface IWidget {}

class Widget implements IWidget {
  constructor(clock: IClock) { void clock; }
}

declare const services: Manifest<"singleton">;

export const registered = services.addClass(typefor<IWidget>(), Widget, typefor<typeof Widget>());
`;

function writeTsconfig(dir: string, name: string, outDir: string, plugins: Array<{ transform: string; }>): void {
  writeFileSync(join(dir, name), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], strict: true,
      outDir: outDir, rootDir: 'src', skipLibCheck: true, noEmitOnError: false, plugins },
    include: ['src/**/*'],
  }));
}

function setupWorkspace(): void {
  const nm = join(projDir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  // Wiped, not merely overwritten: `include: ['src/**/*']` picks up EVERY file
  // here, so a stale leftover from a prior fixture shape (e.g. this project
  // once also carried hand.ts) would silently recompile alongside app.ts.
  rmSync(join(projDir, 'src'), { recursive: true, force: true });
  mkdirSync(join(projDir, 'src'), { recursive: true });
  rmSync(join(projDir, 'dist-inline'), { recursive: true, force: true });
  rmSync(join(projDir, 'dist-semantic'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.extras'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.extras'));

  // The consumer must depend on di.core (the type ANCHOR the inline entries name)
  // AND di.extras (which owns the rhombus-std inline publish list), so the inline
  // collector walks to both.
  writeFileSync(
    join(projDir, 'package.json'),
    // A package name carrying no primitive's name as a substring, so the derived
    // tokens (which embed the package name) don't collide with the primitive-call
    // survival assertions below.
    JSON.stringify({ name: 'di-reg-app', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' } }),
  );
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);

  // Two DIFFERENT spawn descriptors for the SAME always-on host (W7). Neither
  // selects stages — the whole stage table runs either way — so the two lowerings
  // must be byte-identical; that descriptor-independence is what the parity test
  // below asserts. The di.extras/ttsc descriptor is the DI authoring package a
  // consumer directly depends on; primitives.extras/ttsc is its transitive base.
  writeTsconfig(projDir, 'tsconfig.inline.json', 'dist-inline', [{ transform: '@rhombus-std/di.extras/ttsc' }]);
  writeTsconfig(projDir, 'tsconfig.semantic.json', 'dist-semantic', [{
    transform: '@rhombus-std/primitives.extras/ttsc',
  }]);
}

// The hand-written fixture gets its OWN, fully isolated project — a
// source-written primitive call alongside app.ts's addClass<T>() sugar confuses
// the inline collector into spurious INLINE_INFERRED_TYPE_ARGUMENT diagnostics
// against app.ts's OWN calls, so it is driven independently rather than folded
// into setupWorkspace.
const handProjDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'registration-hand');

function setupHandWorkspace(): void {
  const nm = join(handProjDir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  rmSync(join(handProjDir, 'src'), { recursive: true, force: true });
  mkdirSync(join(handProjDir, 'src'), { recursive: true });
  rmSync(join(handProjDir, 'dist-inline'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(DI_TRANSFORMER, join(nm, '@rhombus-std', 'di.extras'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  link(PRIMITIVES_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.extras'));

  writeFileSync(
    join(handProjDir, 'package.json'),
    JSON.stringify({ name: 'di-reg-hand', version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' } }),
  );
  writeFileSync(join(handProjDir, 'src', 'hand.ts'), HAND_SOURCE);
  writeTsconfig(handProjDir, 'tsconfig.inline.json', 'dist-inline', [{ transform: '@rhombus-std/di.extras/ttsc' }]);
}

// A LowerResult exposes both the JS a caller would run (types stripped, the
// existing app.ts / descriptor-independence assertions read this) and the
// still-typed TypeScript ttsc lowered a source file to — the form
// the hand-written re-typecheck below reads, since the JS
// form has no types left to check.
interface LowerResult {
  js(file: string): string;
  ts(file: string): string;
}

function lower(dir: string, tsconfig: string, outDir: string): LowerResult {
  const result = spawnSync('node', [TTSC, '-p', tsconfig], { cwd: dir, encoding: 'utf8', env: goEnv() });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
  return {
    js(file: string): string {
      let lowered: string;
      try {
        lowered = readFileSync(join(dir, outDir, `${file}.js`), 'utf8');
      } catch {
        lowered = envelope.typescript[`src/${file}.ts`] ?? '';
      }
      return new Bun.Transpiler({ loader: 'ts' }).transformSync(lowered);
    },
    ts(file: string): string {
      return envelope.typescript[`src/${file}.ts`] ?? '';
    },
  };
}

/** The generated const module the sandbox's lowered files import their types from. */
function readTypeModule(dir: string, outDir: string): string {
  return readFileSync(join(dir, outDir, '__typefor__.js'), 'utf8');
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

let withInline = '';
let withoutInline = '';
let handWithInline = '';
let handTypedWithInline = '';

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  setupWorkspace();
  const inlineResult = lower(projDir, 'tsconfig.inline.json', 'dist-inline');
  const semanticResult = lower(projDir, 'tsconfig.semantic.json', 'dist-semantic');
  withInline = inlineResult.js('app');
  withoutInline = semanticResult.js('app');

  setupHandWorkspace();
  const handResult = lower(handProjDir, 'tsconfig.inline.json', 'dist-inline');
  handWithInline = handResult.js('hand');
  handTypedWithInline = handResult.ts('hand');
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('registration sugar — addClass / addFactory / addValue', () => {
  test('the sugar is lowered to a Type the caller could have written by hand, with no generics or primitives left', () => {
    const typeModule = readTypeModule(projDir, 'dist-inline');
    // Each verb takes the service type as its first argument, resolved from the
    // generated const module — the same Type factories a caller writing this
    // without the transform would reach for.
    const fooType = constFor(typeModule, 'Type.imported("IFoo", "di-reg-app/tokens/app")');
    const barType = constFor(typeModule, 'Type.imported("IBar", "di-reg-app/tokens/app")');
    const bazType = constFor(typeModule, 'Type.imported("IBaz", "di-reg-app/tokens/app")');
    expect(withInline).toContain(`.addClass(${fooType}`);
    expect(withInline).toContain(`.addFactory(${barType}`);
    expect(withInline).toContain(`.addValue(${bazType}`);
    // The consts are imported, not re-derived at the call site.
    expect(withInline).toContain(`from "./__typefor__.js"`);
    expect(withInline).not.toContain('addClass<');
    expect(withInline).not.toContain('addFactory<');
    expect(withInline).not.toContain('addValue<');
    // No un-lowered primitive CALL survives (assert the call form, not a bare
    // substring, which could appear inside a derived token string).
    expect(withInline).not.toContain('typefor<');
    expect(withInline).not.toContain('typefor(');
    expect(withInline).not.toContain('tokenfor<');
    expect(withInline).not.toContain('tokenfor(');
    // No Type factory of ANY name is spelled at the call site — the whole tree
    // lives in the generated module.
    expect(withInline).not.toContain('Type.');
  });

  test('the generated module mints each distinct type once, with the primitives Type import it needs', () => {
    const typeModule = readTypeModule(projDir, 'dist-inline');
    const declarations = [...typeModule.matchAll(/^export const \$\w+ = (Type\.[^;]+);$/gm)].map((m) => m[1]!);
    expect(declarations.length).toBeGreaterThan(0);
    expect(new Set(declarations).size).toBe(declarations.length);
    expect(typeModule).toContain('from "@rhombus-std/primitives"');
  });

  test('descriptor independence: two different spawn descriptors emit the identical output', () => {
    // Both tsconfigs compile the IDENTICAL source through the SAME always-on host,
    // differing only in which descriptor spawned it. Since the host performs no
    // stage selection, the emitted bytes must be identical — whole-output equality
    // also pins import elision, the derived implementation type, and surrounding
    // whitespace.
    const addLine = (src: string) => src.split('\n').find((l) => l.includes('.addClass('))?.trim();
    const addValueLine = (src: string) => src.split('\n').find((l) => l.includes('.addValue('))?.trim();
    expect(addLine(withInline)).toBeDefined();
    expect(addLine(withInline)).toEqual(addLine(withoutInline));
    expect(addValueLine(withInline)).toBeDefined();
    expect(addValueLine(withInline)).toEqual(addValueLine(withoutInline));
    expect(withInline).toEqual(withoutInline);
  });
});

// balancedCall returns the argument-list text of the call opening at marker
// (the substring from marker's matching `(` to its balanced `)`, exclusive of
// both parens) — used below to isolate the Type.ctor(..., [[]]) node's own arguments
// from the surrounding addClass(...) call.
function balancedCall(src: string, marker: string): string {
  const start = src.indexOf(marker);
  if (start < 0) {
    throw new Error(`marker ${JSON.stringify(marker)} not found in:\n${src}`);
  }
  const open = start + marker.length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') {
      depth++;
    } else if (src[i] === ')') {
      depth--;
      if (depth === 0) {
        return src.slice(open + 1, i);
      }
    }
  }
  throw new Error(`unterminated call at ${open} in:\n${src}`);
}

// topLevelArgCount splits a balanced argument-list text on its TOP-LEVEL commas
// (depth 0 — nested calls' own commas don't count), returning how many
// positional arguments it holds.
function topLevelArgCount(argsText: string): number {
  let depth = 0;
  let count = argsText.trim().length === 0 ? 0 : 1;
  for (const ch of argsText) {
    if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      count++;
    }
  }
  return count;
}

// retypecheck runs a plain (plugin-less) tsc over already-lowered source —
// text with every primitive already substituted, so no ttsc host is needed —
// against the REAL di.core / primitives packages, asserting it type-checks
// clean. This is what proves the emitted Type.ctor(..., [[]]) node is genuinely
// assignable to addClass's real `implementerType: ConstructorType` parameter, not
// merely a string a hand-writer COULD have typed.
function retypecheck(source: string): { readonly status: number | null; readonly output: string; } {
  const dir = join(handProjDir, 'retypecheck');
  rmSync(dir, { recursive: true, force: true });
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  link(TS7, join(nm, 'typescript'));
  link(DI_CORE, join(nm, '@rhombus-std', 'di.core'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));
  writeFileSync(join(dir, 'lowered.ts'), source);
  // The lowered file reaches its derived types through the generated const
  // module, so the program being checked is the emitted file AND that module —
  // copied in as TypeScript, which the `./__typefor__.js` specifier resolves to
  // under bundler resolution.
  writeFileSync(join(dir, '__typefor__.ts'), readTypeModule(handProjDir, 'dist-inline'));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], strict: true,
      noEmit: true, skipLibCheck: true },
    include: ['lowered.ts', '__typefor__.ts'],
  }));
  const result = spawnSync('node', [join(TS7, 'bin', 'tsc'), '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe.skipIf(!toolchainReady)("implementation type — a hand-writer's explicit third argument", () => {
  test('typefor<typeof C>() derives the Type.ctor(..., [[]]) node a hand-writer would spell', () => {
    // The primitive is fully substituted: no typefor call left, and the generated
    // module the emitted consts are read from is imported.
    expect(handWithInline).not.toContain('typefor(');
    expect(handWithInline).not.toContain('typefor<');
    expect(handWithInline).toContain(`from "./__typefor__.js"`);

    // Both arguments came from typefor, so both hoist: the call site carries two
    // const references and the module holds the spellings. The implementation
    // const answers to one call, so it spells flat — the instance type followed
    // by that one dependency, each itself a const.
    const module = readTypeModule(handProjDir, 'dist-inline');
    const widget = constFor(module, 'Type.imported("IWidget", "di-reg-hand/tokens/hand")');
    const widgetClass = constFor(module, 'Type.imported("Widget", "di-reg-hand/tokens/hand")');
    const clock = constFor(module, 'Type.imported("IClock", "di-reg-hand/tokens/hand")');
    const implementerType = constFor(module, `Type.ctor(${widgetClass}, [[${clock}]])`);
    const want = `.addClass(${widget}, Widget, ${implementerType})`;
    expect(handWithInline).toContain(want);
  });

  test('the Type.ctor(..., [[]]) node carries one argument per real dependency (the arity blind spot)', () => {
    // Widget's constructor takes exactly one dependency (clock: IClock) and answers
    // to one call, so its derived node spells flat and carries exactly two
    // positional arguments: the instance type FOLLOWED BY that one dependency —
    // never a bare instance type (an arity that would silently drop the dependency)
    // and never more than two (a duplicated or phantom slot). The const holding
    // it is where that spelling lives.
    const ctorArgs = balancedCall(readTypeModule(handProjDir, 'dist-inline'), 'Type.ctor(');
    expect(topLevelArgCount(ctorArgs)).toBe(2);
  });

  test('the lowered registration re-typechecks against the REAL di.core Manifest.addClass', () => {
    // handTypedWithInline is the emitted file BEFORE tsc's own type-stripping —
    // every primitive already substituted to its Type tree, but the surrounding
    // TS (the interfaces, the class, the import statements) still intact. Feeding
    // it back through a plain, plugin-less tsc against the real
    // di.core/primitives packages is the proof that addClass's real
    // `implementerType: ConstructorType` parameter accepts the derived node — not just
    // that the string LOOKS right.
    expect(handTypedWithInline).not.toContain('typefor(');
    const { status, output } = retypecheck(handTypedWithInline);
    expect(status).toBe(0);
    expect(output.trim()).toBe('');
  });
});

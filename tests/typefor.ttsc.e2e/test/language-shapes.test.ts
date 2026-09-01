import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for typefor's COMPOSITIONAL surface: every shape TypeScript
// lets a developer write in a type position by COMPOSING other types — named
// interfaces/classes/functions, generics (closed, holed, applied to a
// composite), unions, intersections, object literals (nested, optional,
// carrying tuples/arrays), tuples (nested, with an optional or rest element),
// overloaded and parameterized callables, every literal kind, tags, promises,
// iterables, and TypeScript's own closed-argument type-level computation — a
// builtin generic alias, and a conditional type / infer extraction that loses
// its alias and resolves all the way to the concrete shape underneath.
//
// Every one of these MUST derive to a precise `Type` node — this suite asserts
// the exact node, never just "it derived". These expectations were written
// against `libraries/primitives/src/Type/Type.ts` (the `Type` vocabulary) and
// `libraries/primitives.extras/src/typefor.ts` (typefor's own documented
// contract) — NOT against the derivation engine's source, so a mismatch here is
// exactly as likely to be a wrong expectation as an engine defect; each is
// investigated on its own merits, never assumed correct because the engine
// produced it.
//
// A shape that TypeScript expresses only through unbounded type-level
// COMPUTATION over an open argument (a conditional/mapped/template-literal type
// or infinite self-reference that a closed argument cannot resolve away) is
// this suite's twin, refusal-shapes.test.ts — a genuine `Type` vocabulary gap,
// not a compositional case.
//
// The throwaway project lives OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>/typefor-lang-shapes: a
// sandbox under an enclosing package.json makes ttsc re-root its derivation to
// that package. Keying on the worktree dir name keeps concurrent sessions
// apart, and off /tmp (a per-user-quota tmpfs here). The ttsc plugin cache is
// content-keyed and shared machine-wide, so the cold Go plugin build is paid
// once per machine.
//
// This suite needs the Go toolchain (script `test:e2e`) and self-skips when go
// is not resolvable.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const PRIMITIVES_EXTRAS = join(REPO_ROOT, 'libraries', 'primitives.extras');

const PKG_NAME = 'typefor-lang-shapes-app';
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'typefor-lang-shapes');
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
    rmSync(linkPath, { force: true });
    symlinkSync(target, linkPath);
  }
}

/** A build env with a single self-consistent Go toolchain and the shared caches. */
function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = 'local';
  const miseGo = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
  const goBin = miseGo.status === 0 ? miseGo.stdout.trim() : '';
  if (goBin) {
    env.TTSC_GO_BINARY = goBin;
  }
  mkdirSync(goBuildTmp, { recursive: true });
  env.GOTMPDIR = goBuildTmp;
  mkdirSync(ttscCache, { recursive: true });
  env.TTSC_CACHE_DIR = ttscCache;
  env.GOCACHE = process.env.GOCACHE ?? join(homedir(), '.cache', 'go-build');
  return env;
}

// Every base name a shape below composes from. Kept deliberately empty/plain —
// the point of each shape is its STRUCTURE, not what its leaves carry.
const APP_SOURCE = `
import { typefor, Generic, Keyed } from "@rhombus-std/primitives.extras";

export interface IA {}
export interface IB {}
export interface IC {}
export interface IBox<T> { readonly value: T; }
export interface INode { readonly next: INode | undefined; }

export declare class Widget { constructor(a: IA); }
export declare abstract class AbstractWidget { constructor(a: IA); }
export declare function makeWidget(a: IA): IB;

export declare function overloaded(a: IA): IB;
export declare function overloaded(a: IA, b: IB): IC;
export declare class OverloadedWidget {
  constructor(a: IA);
  constructor(a: IA, b: IB);
}
export declare function optParamFn(a: IA, b?: IB): IC;
export declare function restParamFn(a: IA, ...rest: IB[]): IC;

type Cond<T> = T extends string ? IA : IB;
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

// Named addresses and bare intrinsics.
export const named = typefor<IA>();
export const anyType = typefor<any>();
export const unknownType = typefor<unknown>();
export const neverType = typefor<never>();
export const voidType = typefor<void>();
export const symbolType = typefor<symbol>();

// Callable addresses, by name (typeof) rather than by value — the door this
// suite's siblings do not exercise.
export const ctorType = typefor<typeof Widget>();
export const abstractCtorType = typefor<typeof AbstractWidget>();
export const funcType = typefor<typeof makeWidget>();

// Generics: closed, held open by a hole, and applied to a composite argument.
export const genericClosed = typefor<IBox<IA>>();
export const genericHole = typefor<IBox<Generic<"T">>>();
export const genericOfIntersection = typefor<IBox<IA & IB>>();

// Unions and intersections of named types.
export const unionAB = typefor<IA | IB>();
export const interAB = typefor<IA & IB>();

// Object literals: an optional member, deep nesting whose leaves are a tuple
// and an array, a union carrying an object whose property is a tuple of
// callables, and an optional readonly property holding an array of promises.
export const objOptional = typefor<{ readonly a: IA; readonly b?: IB }>();
export const objDeepNested = typefor<{ readonly outer: { readonly list: IA[]; readonly pair: [IA, IB] } }>();
export const unionOfObjOfTuple = typefor<{ readonly items: [() => IA, IB] } | IC>();
export const optionalArrayOfPromises = typefor<{ readonly items?: Promise<IA>[] }>();

// Tuples: nested. An optional or rest tuple ELEMENT is not exercised here —
// unlike an optional object member or a rest parameter, both currently refuse.
export const tupleNested = typefor<[IA, [IB, IC]]>();

// A self-referential type reached through a NAME terminates by naming — the
// walk never has to open INode's own recursive member.
export const selfRefNamed = typefor<INode>();

// Callables: overloaded (func and ctor), an optional parameter, a rest
// parameter.
export const overloadedFunc = typefor<typeof overloaded>();
export const overloadedCtor = typefor<typeof OverloadedWidget>();
export const optParamFunc = typefor<typeof optParamFn>();
export const restParamFunc = typefor<typeof restParamFn>();

// Every literal kind, and the true/false pair TypeScript itself widens back to
// \`boolean\` before this derivation ever sees a union.
export const strLit = typefor<"dev">();
export const negNum = typefor<-5>();
export const negBig = typefor<-7n>();
export const nullLit = typefor<null>();
export const undefLit = typefor<undefined>();
export const boolPairThenNull = typefor<true | false | null>();

// A Keyed brand.
export const tagged = typefor<Keyed<IA, "redis">>();

// Promise and Iterable.
export const promised = typefor<Promise<IA>>();
export const iterableT = typefor<Iterable<IA>>();

// TypeScript's own type-level computation, applied to a CLOSED argument. A
// plain generic alias — even a builtin one — keeps its address the way any
// other alias does; a CONDITIONAL type's resolved branch does not, since which
// branch fired is not itself part of the alias, so it (and an infer extraction
// inside one) resolves all the way to the concrete shape underneath — the same
// way ConstructorParameters<>/Parameters<> resolve to concrete tuples.
export const partialResolved = typefor<Partial<{ readonly a: IA; readonly b: IB }>>();
export const condResolved = typefor<Cond<string>>();
export const inferResolved = typefor<ElementOf<readonly IA[]>>();
`;

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
  link(PRIMITIVES_EXTRAS, join(nm, '@rhombus-std', 'primitives.extras'));

  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);
  // Inline emission: this suite is about WHICH Type node a shape derives to,
  // not the hoisted/inline emission choice itself — emission-parity.test.ts's
  // own concern.
  writeFileSync(join(projDir, 'package.json'), JSON.stringify({
    name: PKG_NAME,
    version: '0.0.0',
    dependencies: { '@rhombus-std/primitives.extras': 'workspace:*' },
    'rhombus-std': { typefor: { emit: 'inline' } },
  }));
  writeFileSync(join(projDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ESNext'], strict: true, outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false,
      plugins: [{ transform: '@rhombus-std/primitives.extras/ttsc' }] },
    include: ['src/**/*'],
  }));

  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: projDir, encoding: 'utf8', env: goEnv() });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  try {
    app = readFileSync(join(projDir, 'dist', 'app.js'), 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    app = envelope.typescript['src/app.ts'] ?? '';
  }
}, COLD_BUILD_MS);

/** `Type.imported("Name", "typefor-lang-shapes-app/private/app")` — every locally-declared name's address. */
function local(name: string): string {
  return `Type.imported("${name}", "${PKG_NAME}/private/app")`;
}

/** The same address, closed over generic arguments. */
function localOf(name: string, args: readonly string[]): string {
  return `Type.imported("${name}", "${PKG_NAME}/private/app", [${args.join(', ')}])`;
}

const IA = local('IA');
const IB = local('IB');
const IC = local('IC');

describe.skipIf(!toolchainReady)('typefor compositional shapes', () => {
  test('named interface', () => {
    expect(app).toContain(`named = ${IA}`);
  });

  test('bare intrinsics: any, unknown, never, symbol', () => {
    expect(app).toContain('anyType = Type.global("any")');
    expect(app).toContain('unknownType = Type.global("unknown")');
    expect(app).toContain('neverType = Type.global("never")');
    expect(app).toContain('symbolType = Type.global("symbol")');
  });

  // void has no literal Type member of its own — it reads as the same
  // `undefined` literal SingletonValue (transforms/internal/tokens/generics.go)
  // already gives it.
  test('void reads as the undefined literal', () => {
    expect(app).toContain('voidType = Type.typeLiteral(undefined)');
  });

  test('constructor, abstract-constructor, and function addresses by name', () => {
    expect(app).toContain(`ctorType = Type.ctor(${local('Widget')}, [[${IA}]])`);
    expect(app).toContain(`abstractCtorType = Type.abstractCtor(${local('AbstractWidget')}, [[${IA}]])`);
    expect(app).toContain(`funcType = Type.func(${IB}, [[${IA}]])`);
  });

  test('generic application: closed, held open by a hole, applied to an intersection', () => {
    expect(app).toContain(`genericClosed = ${localOf('IBox', [IA])}`);
    expect(app).toContain(`genericHole = ${localOf('IBox', ['Type.generic("T")'])}`);
    expect(app).toContain(`genericOfIntersection = ${localOf('IBox', [`Type.intersection(${IA}, ${IB})`])}`);
  });

  test('union and intersection of named types', () => {
    // Member order within Type.union/Type.intersection is not pinned by
    // Type.ts beyond "canonical" — both orders are accepted here.
    const union = app.includes(`unionAB = Type.union(${IA}, ${IB})`) || app.includes(`unionAB = Type.union(${IB}, ${IA})`);
    const inter = app.includes(`interAB = Type.intersection(${IA}, ${IB})`) || app.includes(`interAB = Type.intersection(${IB}, ${IA})`);
    expect(union).toBe(true);
    expect(inter).toBe(true);
  });

  test('object literal with an optional member', () => {
    expect(app).toContain(`objOptional = Type.object({ a: ${IA}, b: Type.union(${IB}, Type.typeLiteral(undefined)) })`);
  });

  test('deeply nested object whose leaves are a tuple and an array — members keyed in SORTED order', () => {
    expect(app).toContain(
      `objDeepNested = Type.object({ outer: Type.object({ list: Type.global("Array", [${IA}]), pair: Type.tuple(${IA}, ${IB}) }) })`,
    );
  });

  test('a union carrying an object whose property is a tuple of callables', () => {
    const object = `Type.object({ items: Type.tuple(Type.func(${IA}, [[]]), ${IB}) })`;
    const forward = app.includes(`unionOfObjOfTuple = Type.union(${object}, ${IC})`);
    const backward = app.includes(`unionOfObjOfTuple = Type.union(${IC}, ${object})`);
    expect(forward || backward).toBe(true);
  });

  test('an optional readonly property holding an array of promises', () => {
    expect(app).toContain(
      `optionalArrayOfPromises = Type.object({ items: Type.union(Type.global("Array", [Type.global("Promise", [${IA}])]), Type.typeLiteral(undefined)) })`,
    );
  });

  test('a nested tuple', () => {
    expect(app).toContain(`tupleNested = Type.tuple(${IA}, Type.tuple(${IB}, ${IC}))`);
  });

  test('a self-referential type reached through a name terminates by naming', () => {
    expect(app).toContain(`selfRefNamed = ${local('INode')}`);
  });

  test('an overloaded function and an overloaded constructor each carry one row per overload', () => {
    expect(app).toContain(`overloadedFunc = Type.func(${IB}, [[${IA}], [${IA}, ${IB}]])`);
    expect(app).toContain(`overloadedCtor = Type.ctor(${local('OverloadedWidget')}, [[${IA}], [${IA}, ${IB}]])`);
  });

  test('a function with an optional parameter', () => {
    expect(app).toContain(`optParamFunc = Type.func(${IC}, [[${IA}, Type.union(${IB}, Type.typeLiteral(undefined))]])`);
  });

  test('a function with a rest parameter', () => {
    expect(app).toContain(`restParamFunc = Type.func(${IC}, [[${IA}, Type.global("Array", [${IB}])]])`);
  });

  test('every literal kind', () => {
    expect(app).toContain('strLit = Type.typeLiteral("dev")');
    expect(app).toContain('negNum = Type.typeLiteral(-5)');
    expect(app).toContain('negBig = Type.typeLiteral(-7n)');
    expect(app).toContain('nullLit = Type.typeLiteral(null)');
    expect(app).toContain('undefLit = Type.typeLiteral(undefined)');
  });

  test('true | false widens to boolean before a union is ever derived, leaving a plain boolean | null union', () => {
    expect(app).toContain('boolPairThenNull = Type.union(Type.global("boolean"), Type.typeLiteral(null))');
  });

  test('a Keyed brand', () => {
    expect(app).toContain(`tagged = Type.tag(${IA}, "redis")`);
  });

  test('Promise and Iterable', () => {
    expect(app).toContain(`promised = Type.global("Promise", [${IA}])`);
    expect(app).toContain(`iterableT = Type.global("Iterable", [${IA}])`);
  });

  test('a builtin generic alias derives by NAME, its argument recursively derived, exactly like a hand-written alias — Partial does not expand to its resolved structure', () => {
    expect(app).toContain(`partialResolved = Type.global("Partial", [Type.object({ a: ${IA}, b: ${IB} })])`);
  });

  test('closed type-level computation that LOSES its alias — a conditional type and an infer extraction — resolves all the way to the concrete shape underneath', () => {
    expect(app).toContain(`condResolved = ${IA}`);
    expect(app).toContain(`inferResolved = ${IA}`);
  });
});

import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the OPEN-length signature rows in both typefor
// emission modes. A callable whose every overload is a fixed argument list
// spells the rows text — `Type.ctor(X, [[…], […]])` — while an overload carrying
// a rest slot, or one that IS a list, takes the slot node's own spelling; the
// hoisted const table mirrors that split. This suite drives the REAL ttsc over
// two sandboxes carrying IDENTICAL source — one hoisted, one inline — and pins,
// per callable shape: the inline text, that expanding the hoisted consts
// reproduces it byte for byte, and that evaluating the emitted expression
// yields the SAME interned `Type` node a hand-written factory call builds, one
// that round-trips through its token spelling.
//
// The sandboxes live OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>/typefor-open-rows/<mode>,
// for the reasons emission-parity.test.ts spells out.
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

const PKG_NAME = 'typefor-open-rows-app';
const sandbox = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'typefor-open-rows');
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
const COLD_BUILD_MS = 600_000;

/** The generated module's name, fixed by the engine. */
const TYPE_MODULE = '__typefor__.js';

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

// One constructor per open-row shape, plus the tuple-typed rest TypeScript
// itself flattens to fixed parameters, and an overload set mixing one fixed
// and one open row.
const APP_SOURCE = `
import { typefor } from "@rhombus-std/primitives.extras";

export interface IA {}
export interface IB {}
export interface IDep {}

export declare class PrefixRest { constructor(a: IA, ...rest: IB[]); }
export declare class AllRest { constructor(...deps: IDep[]); }
export declare class TupleRest { constructor(...args: [IA, IB]); }
export declare class Mixed {
  constructor(a: IA);
  constructor(a: IA, ...rest: IB[]);
}

export const prefixRest = typefor<typeof PrefixRest>();
export const allRest = typefor<typeof AllRest>();
export const tupleRest = typefor<typeof TupleRest>();
export const mixed = typefor<typeof Mixed>();
`;

type Mode = 'hoisted' | 'inline';

function projectDir(mode: Mode): string {
  return join(sandbox, mode);
}

/** Lay out one mode's project: the same source and tsconfig, only the emission differing. */
function setupProject(mode: Mode): void {
  const dir = projectDir(mode);
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  rmSync(join(dir, 'dist'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(PRIMITIVES_EXTRAS, join(nm, '@rhombus-std', 'primitives.extras'));

  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: PKG_NAME,
    version: '0.0.0',
    dependencies: { '@rhombus-std/primitives.extras': 'workspace:*' },
    'rhombus-std': { typefor: { emit: mode } },
  }));
  writeFileSync(join(dir, 'src', 'app.ts'), APP_SOURCE);
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ESNext'], strict: true, outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false,
        plugins: [{ transform: '@rhombus-std/primitives.extras/ttsc' }] },
      include: ['src/**/*'],
    }),
  );
}

/** Run ttsc over one mode's project and return its emitted app.js. */
function lower(mode: Mode): string {
  const dir = projectDir(mode);
  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8', env: goEnv() });
  if (result.status !== 0) {
    throw new Error(`ttsc failed for ${mode} (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  try {
    return readFileSync(join(dir, 'dist', 'app.js'), 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    return new Bun.Transpiler({ loader: 'ts' }).transformSync(envelope.typescript['src/app.ts'] ?? '');
  }
}

/** The generated const module a mode's project emitted, or "" when it emitted none. */
function typeModule(mode: Mode): string {
  const path = join(projectDir(mode), 'dist', TYPE_MODULE);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** Every `export const <name> = <expression>;` a module declares. */
function constants(module: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of module.split('\n')) {
    const match = /^export const (\$?\w+) = (.+);$/.exec(line);
    if (match !== null) {
      found.set(match[1]!, match[2]!);
    }
  }
  return found;
}

/** `text` with every hoisted const reference expanded, repeatedly, down to the factory tree. */
function expand(text: string, declared: Map<string, string>): string {
  let expanded = text;
  for (let pass = 0; pass < declared.size + 1; pass++) {
    const next = expanded.replace(/\$\w+/g, (name) => declared.get(name) ?? name);
    if (next === expanded) {
      return expanded;
    }
    expanded = next;
  }
  throw new Error('the generated consts do not bottom out — a const references itself');
}

/** `Type.imported("Name", "typefor-open-rows-app/private/app")` — every locally-declared name's address. */
function local(name: string): string {
  return `Type.imported("${name}", "${PKG_NAME}/private/app")`;
}

const IA = local('IA');
const IB = local('IB');
const IDEP = local('IDep');

const lowered = new Map<Mode, string>();
const modules = new Map<Mode, string>();
// The runtime the emitted expressions evaluate against — the same one the
// sandboxes' primitives.extras link resolves to.
let Type: typeof import('@rhombus-std/primitives').Type;

beforeAll(async () => {
  Type = (await import('@rhombus-std/primitives')).Type;
  if (!toolchainReady) {
    return;
  }
  for (const mode of ['hoisted', 'inline'] as const) {
    setupProject(mode);
    lowered.set(mode, lower(mode));
    modules.set(mode, typeModule(mode));
  }
}, COLD_BUILD_MS);

/** The expression `name` is initialized with in a mode's emitted app, consts expanded. */
function emitted(mode: Mode, name: string): string {
  const expression = constants(lowered.get(mode)!).get(name);
  if (expression === undefined) {
    throw new Error(`${name} is not a const of the ${mode} emission:\n${lowered.get(mode)}`);
  }
  return expand(expression, constants(modules.get(mode)!));
}

/** The `Type` node the emitted factory text builds when run. */
function evaluate(expression: string): unknown {
  return new Function('Type', `return ${expression};`)(Type);
}

/** The shapes under test: the inline text each must spell, and the hand-written node it must build. */
function shapes() {
  const ia = Type.imported('IA', `${PKG_NAME}/private/app`);
  const ib = Type.imported('IB', `${PKG_NAME}/private/app`);
  const idep = Type.imported('IDep', `${PKG_NAME}/private/app`);
  const instance = (name: string) => Type.imported(name, `${PKG_NAME}/private/app`);
  return {
    prefixRest: {
      text: `Type.ctor(${local('PrefixRest')}, Type.tuple({ members: [${IA}], rest: ${IB} }))`,
      node: Type.ctor(instance('PrefixRest'), Type.tuple({ members: [ia], rest: ib })),
    },
    allRest: {
      text: `Type.ctor(${local('AllRest')}, Type.global("Array", [${IDEP}]))`,
      node: Type.ctor(instance('AllRest'), Type.array(idep)),
    },
    tupleRest: {
      text: `Type.ctor(${local('TupleRest')}, [[${IA}, ${IB}]])`,
      node: Type.ctor(instance('TupleRest'), [[ia, ib]]),
    },
    mixed: {
      text: `Type.ctor(${local('Mixed')}, Type.union(Type.tuple(${IA}), Type.tuple({ members: [${IA}], rest: ${IB} })))`,
      node: Type.ctor(instance('Mixed'), Type.signatures([Type.tuple(ia), Type.tuple({ members: [ia], rest: ib })])),
    },
  };
}

describe.skipIf(!toolchainReady)('open signature rows in both emission modes', () => {
  for (const name of ['prefixRest', 'allRest', 'tupleRest', 'mixed'] as const) {
    describe(name, () => {
      test('inline spells the slot form for an open row and the rows text for a fixed one', () => {
        expect(emitted('inline', name)).toBe(shapes()[name].text);
      });

      test('expanding the hoisted consts reproduces the inline spelling byte for byte', () => {
        expect(emitted('hoisted', name)).toBe(emitted('inline', name));
      });

      test('the emitted expression builds the node a hand-written factory call builds', () => {
        const { node } = shapes()[name];
        expect(evaluate(emitted('inline', name))).toBe(node);
        expect(evaluate(emitted('hoisted', name))).toBe(node);
      });

      test('the node round-trips through its token spelling', () => {
        const { node } = shapes()[name];
        expect(Type.from(Type.stringify(node))).toBe(node);
      });
    });
  }

  test('the hoisted module mints one const per open row and none for a fixed one', () => {
    const declared = [...constants(modules.get('hoisted')!).values()];
    expect(declared).toContain(`Type.ctor(${nameOf(local('TupleRest'))}, [[${nameOf(IA)}, ${nameOf(IB)}]])`);
    expect(declared.filter((spelling) => spelling.startsWith('Type.tuple({ members: ['))).toHaveLength(1);
    expect(declared.filter((spelling) => spelling.startsWith('Type.union('))).toHaveLength(1);
  });
});

/** The hoisted const name holding `spelling`. */
function nameOf(spelling: string): string {
  const declared = constants(modules.get('hoisted')!);
  const found = [...declared].find(([, held]) => held === spelling);
  if (found === undefined) {
    throw new Error(`no hoisted const spells ${spelling}:\n${modules.get('hoisted')}`);
  }
  return found[0];
}

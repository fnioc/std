import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the two typefor EMISSION modes. It drives the REAL ttsc
// over four temp projects carrying IDENTICAL source and differing only in how
// they declare their emission (see DECLARATIONS): two that state it in a
// `rhombus-std.json` a markerless package.json reaches by the default `extends`,
// one that declares nothing at all, and one whose marker extends a sidecar and
// contradicts it.
//
// HOISTED collects every derived type into one generated module of named consts
// and leaves a reference at each call site; INLINE spells each `Type.*` factory
// tree where it was derived. The load-bearing guarantee is that the two describe
// the SAME types: expanding every const back into its call site reproduces the
// inline output byte for byte. Around it: `default` must equal `hoisted` — the
// ruling that hoisted is what a project gets without asking — and `override`
// must too, since a marker's own key wins what it extends.
//
// Each project sits at its own directory because the emission rides the project,
// and all four share one package NAME: a derived type embeds the name of the
// package that declares it, so two differently-named projects could not be
// compared byte for byte.
//
// The throwaway projects live OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>/typefor: a sandbox under an
// ENCLOSING package.json makes ttsc re-root its derivation to that package.
// Keying on the worktree dir name keeps concurrent sessions apart, and off /tmp
// (a per-user-quota tmpfs here). The ttsc plugin cache is content-keyed and
// shared machine-wide, so the cold Go plugin build is paid once per machine.
//
// This suite needs the Go toolchain (script `test:e2e`) and self-skips when go is
// not resolvable.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const PRIMITIVES_EXTRAS = join(REPO_ROOT, 'libraries', 'primitives.extras');

const sandbox = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'typefor');
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
    // A re-run reusing this project dir: the existing entry may point at a
    // now-deleted worktree path, so relink unconditionally rather than trusting
    // it and failing later with a spurious "typescript is required".
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
  // Setting GOCACHE — even to Go's own default path — flips ttsc from a private
  // object cache under TTSC_CACHE_DIR to the ambient one, sharing compiled
  // objects with the transforms Go gates: a cold sidecar build mostly re-links.
  env.GOCACHE = process.env.GOCACHE ?? join(homedir(), '.cache', 'go-build');
  return env;
}

// Every node kind a derived type can carry, and a subtype two call sites share:
// IClock appears bare, inside Promise<>, as a constructor parameter and as a
// factory return, so one const has to serve all four.
const APP_SOURCE = `
import { typefor } from "@rhombus-std/primitives.extras";

export interface IClock {
  now(): string;
}
export interface IAuditLog {
  record(entry: string): void;
}
export type Level = "debug" | "info";

export declare class SystemClock implements IClock {
  constructor(log: IAuditLog);
  now(): string;
}
export declare abstract class AbstractClock implements IClock {
  constructor(log: IAuditLog);
  now(): string;
}
export declare function makeClock(log: IAuditLog): IClock;

export const clock = typefor<IClock>();
export const alsoClock = typefor<IClock>();
export const promisedClock = typefor<Promise<IClock>>();
export const level = typefor<Level>();
export const clockCtor = typefor<typeof SystemClock>();
export const abstractClockCtor = typefor<typeof AbstractClock>();
export const clockFactory = typefor<typeof makeClock>();
`;

type Mode = 'hoisted' | 'inline' | 'default' | 'override';

/** The project directory a mode's sandbox lives at. */
function projectDir(mode: Mode): string {
  return join(sandbox, mode);
}

/**
 * How each sandbox declares its emission — the `rhombus-std` marker its
 * package.json carries, and the `rhombus-std.json` beside it.
 *
 * A package.json with NO marker resolves as though it read
 * `{ "extends": "./rhombus-std.json" }`, so `hoisted` and `inline` state their
 * mode in the sidecar and nothing in package.json. `default` writes no sidecar
 * for that defaulted directive to find, and takes the engine default. `override`
 * has both, with the marker extending the sidecar and contradicting it, so its
 * output pins which one wins.
 */
const DECLARATIONS: Record<Mode, { marker?: unknown; sidecar?: unknown; }> = {
  hoisted: { sidecar: { typefor: { emit: 'hoisted' } } },
  inline: { sidecar: { typefor: { emit: 'inline' } } },
  default: {},
  override: {
    marker: { extends: './rhombus-std.json', typefor: { emit: 'hoisted' } },
    sidecar: { typefor: { emit: 'inline' } },
  },
};

/**
 * Lay out one mode's project: the same source and tsconfig every time, and only
 * the emission declaration differing.
 */
function setupProject(mode: Mode): void {
  const dir = projectDir(mode);
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  rmSync(join(dir, 'rhombus-std.json'), { force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(PRIMITIVES_EXTRAS, join(nm, '@rhombus-std', 'primitives.extras'));

  const { marker, sidecar } = DECLARATIONS[mode];
  const manifest: Record<string, unknown> = {
    // One name across every project: a derived type embeds the declaring
    // package's name, so differing names would make the outputs incomparable.
    name: 'typefor-emit-app',
    version: '0.0.0',
    dependencies: { '@rhombus-std/primitives.extras': 'workspace:*' },
  };
  if (marker !== undefined) {
    manifest['rhombus-std'] = marker;
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  if (sidecar !== undefined) {
    writeFileSync(join(dir, 'rhombus-std.json'), JSON.stringify(sidecar));
  }
  writeFileSync(join(dir, 'src', 'app.ts'), APP_SOURCE);
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], strict: true,
        outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false,
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

/** Every `export const <name> = <expression>;` the generated module declares. */
function constants(module: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of module.split('\n')) {
    const match = /^export const (\$\w+) = (.+);$/.exec(line);
    if (match !== null) {
      found.set(match[1]!, match[2]!);
    }
  }
  return found;
}

/**
 * `text` with every const reference replaced by the expression that const holds,
 * repeatedly, so a composite referencing a member const expands all the way down
 * to the factory tree an inline emission would have written.
 */
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

/**
 * The lowered file's statements, with the import each mode materializes for
 * itself dropped — the generated module in one, the `Type` namespace in the
 * other. What remains is the same program in both, which is what the expansion
 * comparison asserts; the imports themselves are pinned by their own tests.
 */
function statements(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.includes(TYPE_MODULE) && !line.includes('@rhombus-std/primitives'))
    .join('\n');
}

const lowered = new Map<Mode, string>();
const modules = new Map<Mode, string>();

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  for (const mode of ['hoisted', 'inline', 'default', 'override'] as const) {
    setupProject(mode);
    lowered.set(mode, lower(mode));
    modules.set(mode, typeModule(mode));
  }
}, COLD_BUILD_MS);

describe('typefor emission modes', () => {
  test.skipIf(!toolchainReady)('hoisted names every derived type once, and the call sites reference it', () => {
    const app = lowered.get('hoisted')!;
    const declared = constants(modules.get('hoisted')!);

    expect(app).not.toContain('Type.');
    expect(app).toContain(`from "./${TYPE_MODULE}"`);
    // IClock is derived four times over — bare, promised, as a constructor
    // parameter, as a factory return — and earns exactly one const.
    expect([...declared.values()].filter((spelling) => spelling.includes('"IClock"'))).toHaveLength(1);
    // No two consts hold the same expression: the table is one entry per
    // distinct type, which is what makes the count checkable.
    expect(new Set(declared.values()).size).toBe(declared.size);
    for (const name of declared.keys()) {
      expect(app.includes(name) || [...declared.values()].some((spelling) => spelling.includes(name))).toBe(true);
    }
  });

  test.skipIf(!toolchainReady)('a composite const references its members instead of re-spelling them', () => {
    const declared = constants(modules.get('hoisted')!);
    const nameOf = (spelling: string): string => [...declared].find(([, held]) => held === spelling)![0];
    const clock = nameOf('Type.imported("IClock", "typefor-emit-app/tokens/app")');
    const log = nameOf('Type.imported("IAuditLog", "typefor-emit-app/tokens/app")');
    const systemClock = nameOf('Type.imported("SystemClock", "typefor-emit-app/tokens/app")');

    // A generic argument, a constructor's instance type and parameters, and a
    // function's return and parameters are all references — every composite is
    // one factory call over names, never a nested tree.
    // Promise is declared by the ambient scope, so it is addressed as a global
    // and carries no specifier — only its argument, by name.
    expect(declared.get(nameOf(`Type.global("Promise", [${clock}])`))).toBeDefined();
    expect([...declared.values()]).toContain(`Type.ctor(${systemClock}, [[${log}]])`);
    expect([...declared.values()]).toContain(`Type.func(${clock}, [[${log}]])`);

    // An `abstract class` constructor carries the same shape plus a trailing
    // `true` — the flag defaults to false and stays unspelled everywhere else.
    const abstractClock = nameOf('Type.imported("AbstractClock", "typefor-emit-app/tokens/app")');
    expect([...declared.values()]).toContain(`Type.ctor(${abstractClock}, [[${log}]], true)`);
    for (const spelling of declared.values()) {
      if (spelling.startsWith('Type.ctor(') || spelling.startsWith('Type.func(')) {
        expect(spelling).not.toContain('Type.imported(');
        expect(spelling).not.toContain('Type.global(');
      }
    }
  });

  test.skipIf(!toolchainReady)('inline spells the whole tree at the call site and generates no module', () => {
    const app = lowered.get('inline')!;
    expect(modules.get('inline')).toBe('');
    expect(app).not.toContain(TYPE_MODULE);
    expect(app).toContain('Type.imported("IClock", "typefor-emit-app/tokens/app")');
    expect(app).toContain(
      'Type.global("Promise", [Type.imported("IClock", "typefor-emit-app/tokens/app")])',
    );
    expect(app).toContain('Type.union(Type.typeLiteral("debug"), Type.typeLiteral("info"))');
  });

  test.skipIf(!toolchainReady)('each mode materializes only the import it needs', () => {
    // The hoisted file names no factory, so it never reaches for `Type`; the
    // generated module holds that import instead.
    expect(lowered.get('hoisted')).not.toContain('@rhombus-std/primitives');
    expect(modules.get('hoisted')).toContain('import { Type } from "@rhombus-std/primitives";');
    expect(lowered.get('inline')).toContain('@rhombus-std/primitives');
  });

  test.skipIf(!toolchainReady)('expanding every const reproduces the inline emission byte for byte', () => {
    const declared = constants(modules.get('hoisted')!);
    const expanded = expand(statements(lowered.get('hoisted')!), declared);
    expect(expanded).toBe(statements(lowered.get('inline')!));
  });

  test.skipIf(!toolchainReady)('a project that declares no mode gets the hoisted one', () => {
    expect(lowered.get('default')).toBe(lowered.get('hoisted'));
    expect(modules.get('default')).toBe(modules.get('hoisted'));
    expect(modules.get('default')).not.toBe('');
  });

  test.skipIf(!toolchainReady)('the mode reads through the resolved config, and the marker wins what it extends',
    () => {
      // `hoisted` and `inline` state their mode ONLY in rhombus-std.json, reached
      // through the directive a markerless package.json defaults to — so the two
      // differing outputs above are themselves the evidence that an extended file
      // is read at all.
      expect(lowered.get('inline')).not.toBe(lowered.get('hoisted'));
      // `override` extends a sidecar asking for inline and declares hoisted over
      // it: the marker's own key wins the collision.
      expect(lowered.get('override')).toBe(lowered.get('hoisted'));
      expect(modules.get('override')).toBe(modules.get('hoisted'));
    });
});

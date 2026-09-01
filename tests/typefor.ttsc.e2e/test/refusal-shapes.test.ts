import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for typefor's REFUSAL surface: language-shapes.test.ts's
// twin, covering shapes that are not composed from other types but reached only
// through unbounded type-level COMPUTATION — an index signature (however it is
// spelled: a literal one, or a mapped type over an unbounded key set), a
// template literal type over a non-literal placeholder, and a structural type
// that loses its name and self-references. Each is expected to REFUSE rather
// than derive: `libraries/primitives/src/Type/Type.ts`'s `ObjectType.members`
// is a finite Record keyed by known names, its `TypeLiteralType` carries exactly
// one concrete value, and every `Type` node is a finite tree — none of the four
// can spell an unbounded key set, a string PATTERN, or a cycle. The refusal
// itself is the assertion under test, so this harness — unlike
// language-shapes.test.ts's — tolerates a non-zero ttsc exit and inspects
// whatever diagnostics and partial output it produced instead of throwing.
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

const PKG_NAME = 'typefor-refusal-shapes-app';
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'typefor-refusal-shapes');
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
const COLD_BUILD_MS = 420_000;
// A generous per-process cap so a derivation that fails to guard against the
// self-referential shape (an infinite walk rather than a clean refusal) fails
// this suite instead of hanging the gate.
const BUILD_TIMEOUT_MS = 90_000;

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

const APP_SOURCE = `
import { typefor } from "@rhombus-std/primitives.extras";

export interface IA {}

// An index-signature object: no fixed key list a members Record can state.
export const objIndexed = typefor<{ readonly [key: string]: IA }>();

// A mapped type over an UNBOUNDED key set (mapping over the intrinsic \`string\`
// rather than a closed \`keyof X\`) produces the same index-signature shape
// through a different TS surface syntax.
export const mappedIndexed = typefor<{ readonly [K in string]: IA }>();

// A template literal type with a non-literal placeholder: the SET of strings
// it names is unbounded.
type Greeting = \`hello-\${string}\`;
export const templateLit = typefor<Greeting>();

// A self-referential type that lost its name: a conditional type's resolved
// branch does not retain the alias it was reached through — unlike an ordinary
// generic alias (see language-shapes.test.ts's selfRefNamed) — so this is a
// genuinely anonymous record whose own member is the very same type again.
type Cond<T> = T extends never ? never : { readonly self: Cond<T> };
export const selfRefStructural = typefor<Cond<string>>();
`;

interface BuildResult {
  status: number | null;
  stdout: string;
  stderr: string;
  app: string;
}

let result: BuildResult = { status: null, stdout: '', stderr: '', app: '' };

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

  const spawned = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], {
    cwd: projDir,
    encoding: 'utf8',
    env: goEnv(),
    timeout: BUILD_TIMEOUT_MS,
  });
  let app = '';
  try {
    app = readFileSync(join(projDir, 'dist', 'app.js'), 'utf8');
  } catch {
    try {
      const envelope = JSON.parse(spawned.stdout) as { typescript: Record<string, string>; };
      app = envelope.typescript['src/app.ts'] ?? '';
    } catch {
      app = '';
    }
  }
  result = { status: spawned.status, stdout: spawned.stdout ?? '', stderr: spawned.stderr ?? '', app };
}, COLD_BUILD_MS);

/** Whichever of `name`'s two possible outcomes actually shows up in the build: still an un-lowered `typefor<...>()` call, or lowered to some `Type.*` expression — and if the LATTER, what it lowered to. */
function outcomeFor(name: string): { lowered: boolean; text: string; } {
  const pattern = new RegExp(`${name} = ([^;]+);`);
  const match = pattern.exec(result.app);
  if (match === null) {
    return { lowered: false, text: '<no matching declaration found in output>' };
  }
  return { lowered: !match[1]!.includes('typefor'), text: match[1]! };
}

/** The combined process output, the one place a diagnostic naming the problem can show up regardless of exit status. */
function diagnostics(): string {
  return `${result.stdout}\n${result.stderr}`;
}

describe.skipIf(!toolchainReady)('typefor refusal shapes', () => {
  test('an index-signature object refuses rather than deriving a members Record with no wildcard key', () => {
    const outcome = outcomeFor('objIndexed');
    expect(outcome.lowered).toBe(false);
    expect(diagnostics().length).toBeGreaterThan(0);
  });

  test('a mapped type over an unbounded key set refuses the same way a literal index signature does', () => {
    const outcome = outcomeFor('mappedIndexed');
    expect(outcome.lowered).toBe(false);
    expect(diagnostics().length).toBeGreaterThan(0);
  });

  test('a template literal type with a non-literal placeholder refuses — TypeLiteralType carries one concrete value, not a pattern', () => {
    const outcome = outcomeFor('templateLit');
    expect(outcome.lowered).toBe(false);
    expect(diagnostics().length).toBeGreaterThan(0);
  });

  test('a structural type that lost its name and self-references refuses cleanly rather than hanging — Type nodes are a finite tree with no cyclic-reference member', () => {
    // The BUILD_TIMEOUT_MS cap above is this test's real backstop: a derivation
    // with no cycle guard would hang spawnSync itself, failing beforeAll before
    // this test ever runs.
    const outcome = outcomeFor('selfRefStructural');
    expect(outcome.lowered).toBe(false);
    expect(diagnostics().length).toBeGreaterThan(0);
  });
});

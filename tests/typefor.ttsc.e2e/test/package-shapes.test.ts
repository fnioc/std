import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the checker-level half of typefor's specifier
// derivation: which package a name addresses through, and whether a generic
// alias's default type argument gets dropped. This is the half
// `tokens/packages.go`'s own unit tests (packages_test.go) explicitly leave to a
// *.ttsc.e2e suite against real packages, since it needs the checker's actual
// membership answer over a real `exports` map rather than a synthesized one; the
// same is true of `tokens/derive.go`'s alias-default comparison, which has no
// direct unit test of its own. Every shape here drives the SAME `tokens.DeriveTyped`
// derivation nameof's now-retired token composition used, spelled through typefor's
// `Type.imported`/`Type.global` grammar instead of a flat string.
//
// The throwaway project lives OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>/typefor-shapes: a sandbox under
// an enclosing package.json makes ttsc re-root its derivation to that package.
// Keying on the worktree dir name keeps concurrent sessions apart, and off /tmp (a
// per-user-quota tmpfs here). The ttsc plugin cache is content-keyed and shared
// machine-wide, so the cold Go plugin build is paid once per machine.
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

const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'typefor-shapes');
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
    // A re-run reusing this project dir: the existing entry's target may be a
    // now-deleted worktree path, so relink unconditionally.
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

  // A package-public library with an exports subpath map AND a root re-export of
  // a deeply-declared interface — the augmentation-token shape a real consumer
  // reaches through a barrel.
  const lib = join(nm, 'your-lib');
  mkdirSync(join(lib, 'contracts'), { recursive: true });
  mkdirSync(join(lib, 'internal'), { recursive: true });
  writeFileSync(join(lib, 'package.json'), JSON.stringify({ name: 'your-lib', version: '3.4.5', exports: { '.': './index.js', './contracts': './contracts/index.js' } }));
  // Everything a call site derives for is barrel-reachable: the strict derivation
  // rejects a type reachable only through a non-barrel, non-`./tokens/*` subpath.
  writeFileSync(join(lib, 'index.d.ts'), `export { Deep } from "./internal/deep";\nexport { IFoo, Scoped } from "./contracts/index.js";\n`);
  writeFileSync(join(lib, 'internal', 'deep.d.ts'), `export interface Deep {}\n`);
  writeFileSync(join(lib, 'contracts', 'index.d.ts'),
    `export interface IFoo {}\nexport interface ScopedBase<S extends string> {}\nexport type Scoped<S extends string = "singleton"> = ScopedBase<S>;\n`);

  writeFileSync(join(projDir, 'src', 'app.ts'), `
import { typefor } from "@rhombus-std/primitives.extras";
import { IFoo, Scoped } from "your-lib/contracts";
import { Deep } from "your-lib";
interface LocalBase<S extends string> {}
type Local<S extends string = "singleton"> = LocalBase<S>;
export const packagePublic = typefor<IFoo>();
export const bareReexport = typefor<Deep>();
export const localDefaultAlias = typefor<Local>();
export const localExplicitAlias = typefor<Local<"request">>();
export const publicDefaultAlias = typefor<Scoped>();
export const publicExplicitAlias = typefor<Scoped<"request">>();
`);
  // Pin inline emission: this suite's assertions are about WHICH specifier and
  // WHICH arguments a call site derives, not about the hoisted/inline emission
  // choice itself — that's emission-parity.test.ts's own concern.
  writeFileSync(join(projDir, 'package.json'), JSON.stringify({
    name: 'typefor-pkg-shapes-app',
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

describe.skipIf(!toolchainReady)('typefor package-boundary derivation', () => {
  test('package-public barrel: the shorter root subpath wins over a longer named one', () => {
    // IFoo is reachable through BOTH the root barrel and the public `./contracts`
    // subpath; the root wins (shortest-subpath rule), so the specifier is the
    // bare package name, not `your-lib/contracts`.
    expect(app).toContain('Type.imported("IFoo", "your-lib")');
  });

  test('root re-export of a deeply-declared type: bare-package specifier', () => {
    // Deep is declared in your-lib/internal/deep.d.ts and reachable ONLY through
    // the root re-export — the augmentation-token shape.
    expect(app).toContain('Type.imported("Deep", "your-lib")');
  });

  test('defaulted-generic alias, referenced bare: the default argument is dropped', () => {
    // A fully-defaulted instantiation IS the bare alias, so a bare reference to
    // Local / Scoped derives without their "singleton" default rather than
    // closing it in.
    expect(app).toContain('localDefaultAlias = Type.imported("Local", "typefor-pkg-shapes-app/tokens/app")');
    expect(app).not.toContain(
      'Type.imported("Local", "typefor-pkg-shapes-app/tokens/app", [Type.typeLiteral("singleton")])',
    );
    expect(app).toContain('publicDefaultAlias = Type.imported("Scoped", "your-lib")');
    expect(app).not.toContain('Type.imported("Scoped", "your-lib", [Type.typeLiteral("singleton")])');
  });

  test('defaulted-generic alias with an explicit non-default argument: closed type', () => {
    expect(app).toContain(
      'localExplicitAlias = Type.imported("Local", "typefor-pkg-shapes-app/tokens/app", [Type.typeLiteral("request")])',
    );
    expect(app).toContain('publicExplicitAlias = Type.imported("Scoped", "your-lib", [Type.typeLiteral("request")])');
  });
});

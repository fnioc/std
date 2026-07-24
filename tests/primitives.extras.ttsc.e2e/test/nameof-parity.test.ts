import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e parity: drives the REAL ttsc (typescript-go toolchain) over
// a temp project that wires the Go tokenfor plugin through the `@rhombus-std/
// primitives.extras/ttsc` descriptor, then asserts the emitted JS carries
// the SAME byte-identical token strings the hand-written TypeScript tokenfor
// transformer produces (the parity corpus lives in
// tests/di.extras.test/test/{tokens,tokenfor}.test.ts).
//
// The throwaway project lives OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>: it must sit outside any
// enclosing package.json, or ttsc re-roots the fixture's local tokens as members
// of that package (a sandbox under the monorepo derives
// `@rhombus-std/monorepo/…:ILocal` instead of the package-less `./app:ILocal`).
// Keying on the worktree dir name keeps concurrent sessions in different worktrees
// from colliding, and off /tmp (a per-user-quota tmpfs here). The ttsc plugin
// cache is content-keyed and shared machine-wide at ~/.cache/fnioc-ttsc/cache
// (keyed sidecar binaries + a ~3G Go object cache), so the cold ~5-minute Go
// plugin build is paid once per machine, not once per suite.
//
// This suite needs the Go toolchain, so it is kept OUT of the default
// `bun run test` gate (script `test:e2e`, not `test`) and self-skips when go is
// not resolvable — run it deliberately with `bun run --filter '*' test:e2e`.
//
// Toolchain: ttsc ships its own Go SDK and prefers it, but it inherits GOROOT
// from the ambient (mise) environment — a version split there makes the plugin
// compile fail. We pin the build to a single self-consistent toolchain by
// pointing TTSC_GO_BINARY at mise's go and forcing GOTOOLCHAIN=local.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const PRIM = join(REPO_ROOT, 'libraries', 'primitives.extras');

// Outside the repo tree (see the header: an enclosing package.json re-roots token
// derivation), keyed by the worktree dir name so concurrent sessions don't collide.
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'nameof');
// The plugin cache (keyed sidecar binaries) and the Go build scratch/object cache
// are content-keyed, so one machine-wide location is shared across every suite,
// worktree, and session. Default-if-unset so CI or a shell can override.
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
    // now-deleted worktree path (a dangling symlink), not the stable in-repo
    // path the old EEXIST-skip assumed. Relink unconditionally rather than
    // trusting it — the alternative is a stale dangling symlink surviving
    // until the NEXT run fails with a spurious "typescript is required".
    rmSync(linkPath, { force: true });
    symlinkSync(target, linkPath);
  }
}

/** A build env with a single self-consistent Go toolchain (see file header). */
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
  // `go build`'s $WORK dir defaults to $TMPDIR (a per-user-quota tmpfs here);
  // compiling the typescript-go checker the plugin links against needs a few GB
  // of scratch, so redirect GOTMPDIR onto the shared home-cache dir — matching the
  // sibling ttsc.e2e suites and scripts/build-package.ts's ttscEnv. TTSC_CACHE_DIR
  // pins the content-keyed plugin cache to the same shared home dir (otherwise it
  // lands under this sandbox's node_modules and re-compiles the sidecar per suite).
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
  link(PRIM, join(nm, '@rhombus-std', 'primitives.extras'));

  // A package-public library with an exports subpath map AND a root re-export of
  // a deeply-declared interface — the release-critical augmentation-token shape.
  const lib = join(nm, 'your-lib');
  mkdirSync(join(lib, 'contracts'), { recursive: true });
  mkdirSync(join(lib, 'internal'), { recursive: true });
  writeFileSync(
    join(lib, 'package.json'),
    JSON.stringify({
      name: 'your-lib',
      version: '3.4.5',
      exports: { '.': './index.js', './contracts': './contracts/index.js' },
    }),
  );
  // Everything a token derives for is barrel-reachable: the strict derivation
  // rejects a token reachable only through a non-barrel, non-`./tokens/*` subpath.
  writeFileSync(
    join(lib, 'index.d.ts'),
    `export { Deep } from "./internal/deep";\nexport { IFoo, Scoped } from "./contracts/index.js";\n`,
  );
  writeFileSync(join(lib, 'internal', 'deep.d.ts'), `export interface Deep {}\n`);
  writeFileSync(
    join(lib, 'contracts', 'index.d.ts'),
    `export interface IFoo {}\nexport interface ScopedBase<S extends string> {}\nexport type Scoped<S extends string = "singleton"> = ScopedBase<S>;\n`,
  );

  writeFileSync(join(projDir, 'src', 'tokenfor.ts'), `export declare function tokenfor<T>(): string;\n`);
  writeFileSync(
    join(projDir, 'src', 'app.ts'),
    `
import { tokenfor } from "./tokenfor";
import { IFoo, Scoped } from "your-lib/contracts";
import { Deep } from "your-lib";
interface ILocal {}
interface LocalBase<S extends string> {}
type Local<S extends string = "singleton"> = LocalBase<S>;
export const appInternal = tokenfor<ILocal>();
export const asyncToken = tokenfor<Promise<ILocal>>();
export const packagePublic = tokenfor<IFoo>();
export const bareReexport = tokenfor<Deep>();
export const localDefaultAlias = tokenfor<Local>();
export const localExplicitAlias = tokenfor<Local<"request">>();
export const publicDefaultAlias = tokenfor<Scoped>();
export const publicExplicitAlias = tokenfor<Scoped<"request">>();
`,
  );
  writeFileSync(
    join(projDir, 'tsconfig.json'),
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
        plugins: [{ transform: '@rhombus-std/primitives.extras/ttsc' }],
      },
      include: ['src/**/*'],
    }),
  );

  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], {
    cwd: projDir,
    encoding: 'utf8',
    env: goEnv(),
  });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  // The lowering is validated on the plugin's authoritative transform output —
  // the transformed TypeScript ttsc feeds to the emit stage (and that
  // @ttsc/unplugin/bun consumes directly). Prefer the emitted dist JS when ttsc
  // wrote it; otherwise read the transform envelope ttsc surfaces on stdout.
  try {
    app = readFileSync(join(projDir, 'dist', 'app.js'), 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    app = envelope.typescript['src/app.ts'] ?? '';
  }
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('ttsc/Go tokenfor lowering byte-parity', () => {
  test('app-internal type → rootless ./path:Symbol token', () => {
    expect(app).toContain(`"./app:ILocal"`);
    expect(app).not.toContain('tokenfor<');
  });

  test('Promise<T> → honest closed-generic token', () => {
    expect(app).toContain(`"Promise<./app:ILocal>"`);
  });

  test('package-public barrel → importSpecifier:Symbol', () => {
    expect(app).toContain(`"your-lib:IFoo"`);
  });

  test('root re-export of a deep declaration → bare-package Tier-1 token', () => {
    // The augmentation-token shape: tokenfor<T>() over an interface re-exported
    // from the package root tokenizes as the bare package, not the nested file.
    expect(app).toContain(`"your-lib:Deep"`);
  });

  test('defaulted-generic alias, referenced bare → bare alias token (defaults dropped)', () => {
    // A fully-defaulted instantiation IS the bare alias, so tokenfor<Local>() /
    // tokenfor<Scoped>() drop the "singleton" default rather than closing it in —
    // the augmentation-token shape (`tokenfor<IServiceManifest>()`, whose
    // `type IServiceManifest<S extends string = "singleton"> = …<S>` mirrors the
    // fixture's `Local`/`Scoped`). Anchor each token to its own export name so
    // the sibling explicit-arg alias in the same file can't cross-match. The
    // emit escapes inner quotes (`\"request\"`), so the default form we must
    // NOT see is `Local<\"singleton\">`.
    expect(app).toContain(`localDefaultAlias = "./app:Local"`);
    expect(app).not.toContain(`"./app:Local<\\"singleton\\">"`);
    expect(app).toContain(`publicDefaultAlias = "your-lib:Scoped"`);
    expect(app).not.toContain(`"your-lib:Scoped<\\"singleton\\">"`);
  });

  test('defaulted-generic alias with an explicit non-default arg → closed token', () => {
    expect(app).toContain(`localExplicitAlias = "./app:Local<\\"request\\">"`);
    expect(app).toContain(`publicExplicitAlias = "your-lib:Scoped<\\"request\\">"`);
  });

  test('the elided tokenfor import leaves no dangling build-time import', () => {
    expect(app).not.toContain('tokenfor');
    expect(app).not.toContain('./tokenfor');
  });
});

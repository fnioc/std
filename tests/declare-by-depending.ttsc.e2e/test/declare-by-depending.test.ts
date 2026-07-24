import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// End-to-end proof of declare-by-depending, driven through the REAL ttsc (§100).
// There is no stage selection (W7): the one owner host runs its WHOLE always-on
// stage table once spawned, and SPAWNING is what a dependency governs — ttsc's own
// auto-discovery spawns the host from a consumer's DIRECT *.extras dep (its
// ttsc.plugin marker), else no host spawns at all. Two fixtures, neither with an
// explicit tsconfig `plugins` array:
//
//   1. a marked authoring dep spawns the host — a consumer that DIRECTLY devDeps
//      di.extras (which carries the ttsc.plugin marker) and calls tokenfor<T>().
//      Auto-discovery spawns the host off di.extras; the always-on host lowers
//      tokenfor<T>() to its token.
//   2. cores don't spawn the host — a consumer that deps ONLY di.core (a core, no
//      ttsc.plugin marker, though di.core itself devDeps primitives.extras to build
//      ITSELF). Auto-discovery finds no marker, so NO host spawns and tokenfor<T>()
//      is emitted UNTOUCHED. di.core's own devDep must not spill onto its consumer.
//
// The fixture root lives OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname> (off /tmp, a per-user-quota
// tmpfs here): a sandbox under an enclosing package.json makes ttsc re-root its
// token derivation to that package, and keying on the worktree dir name keeps
// concurrent sessions in different worktrees from colliding. The ttsc plugin cache
// is content-keyed and shared machine-wide at ~/.cache/fnioc-ttsc/cache, so the
// cold sidecar build is paid once per machine. Needs the Go toolchain; self-skips
// when go is absent.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const TTSC_PKG = join(PKG_ROOT, 'node_modules', 'ttsc');
const lib = (name: string): string => join(REPO_ROOT, 'libraries', name);

// Outside the repo tree (see the header: an enclosing package.json re-roots token
// derivation), keyed by the worktree dir name so concurrent sessions don't collide.
const ROOT = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'dbd');
const CONSUMER = join(ROOT, 'consumer'); // fixture 1: devDeps di.extras
const CORE_ONLY = join(ROOT, 'core-only'); // fixture 2: deps only di.core
// The plugin cache (keyed sidecar binaries) and the Go build scratch/object cache
// are content-keyed, so one machine-wide location is shared across every suite,
// worktree, and session. Default-if-unset so CI or a shell can override.
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
const COLD_BUILD_MS = 600_000;

// A lone tokenfor<T>() over a local interface — the observable both fixtures share:
// lowered to "@fixture/consumer/tokens/app:IWidget" (the named-package consumer's
// package-qualified self-token) when the primitive stages activate, left as a bare
// tokenfor() call when they do not.
const APP_SOURCE = `
import { tokenfor } from "./tokenfor";

export interface IWidget {}

export const widgetToken = tokenfor<IWidget>();
`;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; link targets are stable.
  }
}

/** A build env with a single self-consistent Go toolchain (see the tokenfor e2e). */
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

/** Write the shared src + a no-plugins tsconfig into a fixture dir. */
function writeProject(projDir: string): void {
  mkdirSync(join(projDir, 'src'), { recursive: true });
  rmSync(join(projDir, 'dist'), { recursive: true, force: true });
  writeFileSync(join(projDir, 'src', 'tokenfor.ts'), `export declare function tokenfor<T>(): string;\n`);
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);
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
      },
      include: ['src/**/*'],
    }),
  );
}

/** Link the shared ttsc toolchain into a fixture's node_modules. */
function linkToolchain(projDir: string): void {
  const nm = join(projDir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  link(TS7, join(nm, 'typescript'));
  link(TTSC_PKG, join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
}

/** Drive the real ttsc over a fixture and return its transformed app module. */
function driveTtsc(projDir: string): string {
  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], {
    cwd: projDir,
    encoding: 'utf8',
    env: goEnv(),
  });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  try {
    return readFileSync(join(projDir, 'dist', 'app.js'), 'utf8');
  } catch {
    // A host that ran source-to-source surfaces the transform on stdout instead.
    const envelope = JSON.parse(result.stdout || '{}') as { typescript?: Record<string, string>; };
    return envelope.typescript?.['src/app.ts'] ?? '';
  }
}

let consumerApp = '';
let coreOnlyApp = '';

beforeAll(async () => {
  if (!toolchainReady) {
    return;
  }
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(CONSUMER, { recursive: true });
  mkdirSync(CORE_ONLY, { recursive: true });

  // Fixture 1: devDeps di.extras (the transitivity proof). di.extras's
  // own primitives.extras dependency is what carries the tokenfor stage; the
  // host reaches it through the scan. The transitive @rhombus-std packages are
  // linked so the host's walk resolves them from the fixture's node_modules.
  writeFileSync(
    join(CONSUMER, 'package.json'),
    JSON.stringify({
      name: '@fixture/consumer',
      private: true,
      devDependencies: { '@rhombus-std/di.extras': '*' },
    }),
  );
  linkToolchain(CONSUMER);
  const cScoped = join(CONSUMER, 'node_modules', '@rhombus-std');
  link(lib('di.extras'), join(cScoped, 'di.extras'));
  link(lib('di.core'), join(cScoped, 'di.core'));
  link(lib('primitives'), join(cScoped, 'primitives'));
  link(lib('primitives.extras'), join(cScoped, 'primitives.extras'));
  writeProject(CONSUMER);

  // Fixture 2: deps ONLY di.core. di.core carries no ttsc.plugin marker, so
  // auto-discovery spawns no host — even though di.core devDeps
  // primitives.extras to lower its OWN source (a transitive devDep that must
  // not leak).
  writeFileSync(
    join(CORE_ONLY, 'package.json'),
    JSON.stringify({
      name: '@fixture/core-only',
      private: true,
      dependencies: { '@rhombus-std/di.core': '*' },
    }),
  );
  linkToolchain(CORE_ONLY);
  link(lib('di.core'), join(CORE_ONLY, 'node_modules', '@rhombus-std', 'di.core'));
  writeProject(CORE_ONLY);

  // Build @rhombus-std/primitives if absent so fixture 1's transitive walk sees a
  // resolvable package (the walk reads its manifest).
  if (!existsSync(join(lib('primitives'), 'dist', 'index.js'))) {
    const build = spawnSync('bun', ['run', 'build'], { cwd: lib('primitives'), encoding: 'utf8' });
    if (build.status !== 0) {
      throw new Error(`primitives build failed:\n${build.stdout}\n${build.stderr}`);
    }
  }

  consumerApp = driveTtsc(CONSUMER);
  coreOnlyApp = driveTtsc(CORE_ONLY);
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('declare-by-depending through real ttsc', () => {
  test('a direct di.extras dep spawns the always-on host and lowers tokenfor', () => {
    // Auto-discovery spawned the host off di.extras's ttsc.plugin marker; the
    // always-on host lowered tokenfor<IWidget>() to its token.
    expect(consumerApp).toContain('"@fixture/consumer/tokens/app:IWidget"');
    expect(consumerApp).not.toContain('tokenfor');
  });

  test("a di.core-only consumer is left untouched (cores don't spawn the host)", () => {
    // No *.extras dep → auto-discovery spawns no host → tokenfor<IWidget>()
    // survives unlowered. di.core's own primitives.extras devDep did not leak.
    expect(coreOnlyApp).toContain('tokenfor');
    expect(coreOnlyApp).not.toContain('"@fixture/consumer/tokens/app:IWidget"');
  });
});

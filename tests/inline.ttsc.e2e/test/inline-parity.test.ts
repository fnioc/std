import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

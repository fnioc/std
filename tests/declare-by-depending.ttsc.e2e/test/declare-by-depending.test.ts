import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// End-to-end proof of declare-by-depending stage selection, driven through the
// REAL ttsc (§100). Selection is HOST-SIDE: ttsc's own auto-discovery spawns the
// one owner host from a consumer's DIRECT *.transformer dep, and the host then
// self-selects the full stage set from its own transitive dependency scan. Two
// fixtures, neither with an explicit tsconfig `plugins` array:
//
//   1. transitivity — a consumer that DIRECTLY devDeps di.transformer (whose only
//      declared stage is `di`) and calls nameof<T>(). Auto-discovery spawns the
//      host off di.transformer; the host's scan then reaches primitives.transformer
//      THROUGH di.transformer's honest dependency edge and activates the nameof
//      stage, so nameof<T>() lowers to its token. ttsc's own direct-only discovery
//      could never reach that transitive stage — this is what the host scan adds.
//   2. cores don't force-activate — a consumer that deps ONLY di.core (a core, no
//      ttsc.plugin marker, though di.core itself devDeps primitives.transformer to
//      build ITSELF). Auto-discovery finds no marker, so no host spawns and
//      nameof<T>() is emitted UNTOUCHED. di.core's own devDep must not leak.
//
// The fixture root is STABLE (not mkdtemp) so the project-local ttsc plugin cache
// survives across runs. Needs the Go toolchain; self-skips when go is absent.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const TTSC_PKG = join(PKG_ROOT, 'node_modules', 'ttsc');
const lib = (name: string): string => join(REPO_ROOT, 'libraries', name);

const ROOT = join(tmpdir(), 'fnioc-ttsc-dbd-e2e');
const CONSUMER = join(ROOT, 'consumer'); // fixture 1: devDeps di.transformer
const CORE_ONLY = join(ROOT, 'core-only'); // fixture 2: deps only di.core
const COLD_BUILD_MS = 600_000;

// A lone nameof<T>() over a local interface — the observable both fixtures share:
// lowered to "@fixture/consumer/tokens/app:IWidget" (the named-package consumer's
// package-qualified self-token) when the primitive stages activate, left as a bare
// nameof() call when they do not.
const APP_SOURCE = `
import { nameof } from "./nameof";

export interface IWidget {}

export const widgetToken = nameof<IWidget>();
`;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; link targets are stable.
  }
}

/** A build env with a single self-consistent Go toolchain (see the nameof e2e). */
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
  const goTmp = join(homedir(), '.cache', 'fnioc-ttsc-build-tmp');
  mkdirSync(goTmp, { recursive: true });
  env.GOTMPDIR = goTmp;
  return env;
}

/** Write the shared src + a no-plugins tsconfig into a fixture dir. */
function writeProject(projDir: string): void {
  mkdirSync(join(projDir, 'src'), { recursive: true });
  rmSync(join(projDir, 'dist'), { recursive: true, force: true });
  writeFileSync(join(projDir, 'src', 'nameof.ts'), `export declare function nameof<T>(): string;\n`);
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

  // Fixture 1: devDeps di.transformer (the transitivity proof). di.transformer's
  // own primitives.transformer dependency is what carries the nameof stage; the
  // host reaches it through the scan. The transitive @rhombus-std packages are
  // linked so the host's walk resolves them from the fixture's node_modules.
  writeFileSync(
    join(CONSUMER, 'package.json'),
    JSON.stringify({
      name: '@fixture/consumer',
      private: true,
      devDependencies: { '@rhombus-std/di.transformer': '*' },
    }),
  );
  linkToolchain(CONSUMER);
  const cScoped = join(CONSUMER, 'node_modules', '@rhombus-std');
  link(lib('di.transformer'), join(cScoped, 'di.transformer'));
  link(lib('di.core'), join(cScoped, 'di.core'));
  link(lib('primitives'), join(cScoped, 'primitives'));
  link(lib('primitives.transformer'), join(cScoped, 'primitives.transformer'));
  writeProject(CONSUMER);

  // Fixture 2: deps ONLY di.core. di.core carries no ttsc.plugin marker, so
  // auto-discovery spawns no host — even though di.core devDeps
  // primitives.transformer to lower its OWN source (a transitive devDep that must
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
  test('a di.transformer dep transitively activates the nameof stage', () => {
    // The host reached primitives.transformer through di.transformer's honest
    // dependency edge and lowered nameof<IWidget>() to its token.
    expect(consumerApp).toContain('"@fixture/consumer/tokens/app:IWidget"');
    expect(consumerApp).not.toContain('nameof');
  });

  test("a di.core-only consumer is left untouched (cores don't force-activate)", () => {
    // No *.transformer dep → auto-discovery spawns no host → nameof<IWidget>()
    // survives unlowered. di.core's own primitives.transformer devDep did not leak.
    expect(coreOnlyApp).toContain('nameof');
    expect(coreOnlyApp).not.toContain('"@fixture/consumer/tokens/app:IWidget"');
  });
});

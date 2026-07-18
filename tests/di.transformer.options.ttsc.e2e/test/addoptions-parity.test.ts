import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Production-path e2e parity: drives the REAL ttsc (typescript-go toolchain) over
// a temp project that wires the Go addOptions<T>() plugin through the
// `@rhombus-std/di.transformer.options/ttsc` descriptor, then asserts the emitted
// JS carries the SAME byte-identical two-token lowering the hand-written
// TypeScript options-sugar transformer produces (the unit corpus lives in
// tests/di.transformer.options.test/test/lowering.test.ts).
//
// The fixture path is STABLE (not mkdtemp) so the project-local ttsc plugin cache
// (node_modules/.cache/ttsc) survives across runs: the first run pays the cold
// ~5-minute Go plugin build, later runs are instant.
//
// This suite needs the Go toolchain, so it is kept OUT of the default
// `bun run test` gate (script `test:e2e`, not `test`) and self-skips when go is
// not resolvable — run it deliberately with `bun run --filter '*' test:e2e`.
//
// Toolchain: ttsc ships its own Go SDK and prefers it, but it inherits GOROOT
// from the ambient (mise) environment — a version split there makes the plugin
// compile fail. We pin the build to a single self-consistent toolchain by
// pointing TTSC_GO_BINARY at mise's go and forcing GOTOOLCHAIN=local.
//
// Build scratch: `go build`'s $WORK dir defaults to $TMPDIR (often a small
// tmpfs). Compiling the typescript-go checker the plugin links against needs a
// few GB of scratch, so we redirect GOTMPDIR onto a roomy home-cache dir to
// avoid an ENOSPC ("disk quota exceeded") on a tmpfs /tmp.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const DI_OPTIONS = join(REPO_ROOT, 'libraries', 'di.transformer.options');

const projDir = join(tmpdir(), 'fnioc-ttsc-addoptions-e2e');
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
  const goTmp = join(homedir(), '.cache', 'fnioc-ttsc-build-tmp');
  mkdirSync(goTmp, { recursive: true });
  env.GOTMPDIR = goTmp;
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
  link(DI_OPTIONS, join(nm, '@rhombus-std', 'di.transformer.options'));

  // The package-public IOptions<T> whose base the wrapper token is built over:
  // an `@rhombus-std/options`-named package exporting a generic Options interface
  // at its ROOT specifier — exactly the shape resolveOptionsBase recognizes.
  const options = join(nm, '@rhombus-std', 'options');
  mkdirSync(options, { recursive: true });
  writeFileSync(
    join(options, 'package.json'),
    JSON.stringify({ name: '@rhombus-std/options', version: '1.0.0', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(options, 'index.d.ts'), `export interface IOptions<T> { readonly value: T; }\n`);

  // A package-public element type, to prove the wrapper composes over a Tier-1
  // element token (not just an app-internal one).
  const lib = join(nm, 'your-lib');
  mkdirSync(join(lib, 'contracts'), { recursive: true });
  writeFileSync(
    join(lib, 'package.json'),
    JSON.stringify({ name: 'your-lib', version: '3.4.5', exports: { './contracts': './contracts/index.js' } }),
  );
  writeFileSync(join(lib, 'contracts', 'index.d.ts'), `export interface IFoo { flag: boolean; }\n`);

  // The ambient `declare module "@rhombus-std/di.core"` fixture: a script `.d.ts`
  // declaring `IServiceManifestBase` with the sugar + explicit overloads. The
  // matcher anchors on this declaration site, so every receiver whose `addOptions`
  // resolves back here is lowered — regardless of the receiver's own symbol name.
  writeFileSync(
    join(projDir, 'src', 'di-core.d.ts'),
    `declare module "@rhombus-std/di.core" {
  export type AddBuilder<Scopes extends string = "singleton"> = { as(scope: Scopes): void };
  export interface IServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    addOptions<T>(): AddBuilder<Scopes>;
    addOptions(token: string, tToken: string): AddBuilder<Scopes>;
  }
  export namespace Nested {
    export interface IServiceManifestBase<Scopes extends string = "singleton"> {
      addOptions<T>(): AddBuilder<Scopes>;
    }
  }
}
`,
  );
  // Fixture calls in every receiver shape under test: an interface-typed
  // variable, a subinterface, a class carrying the empty extends-merge, and a
  // generic bound by the interface all lower; the explicit verb, an anonymous
  // object, and a local type merely NAMED `IServiceManifest` do not.
  writeFileSync(
    join(projDir, 'src', 'app.ts'),
    `
import type { IOptions } from "@rhombus-std/options";
import { IFoo } from "your-lib/contracts";
import type { Nested, IServiceManifestBase } from "@rhombus-std/di.core";
export type __KeepOptions<T> = IOptions<T>;
declare const services: IServiceManifestBase<"singleton">;
interface AppConfig { host: string; port: number; }

export const appInternal = services.addOptions<AppConfig>();
export const chained = services.addOptions<AppConfig>().as("singleton");
export const packagePublic = services.addOptions<IFoo>();

interface MyManifest extends IServiceManifestBase {}
declare const sub: MyManifest;
export const viaSubinterface = sub.addOptions<AppConfig>();

declare class MyThing {}
interface MyThing extends IServiceManifestBase {}
declare const thing: MyThing;
export const viaClassMerge = thing.addOptions<AppConfig>();

function useGeneric<M extends IServiceManifestBase>(m: M) {
  return m.addOptions<AppConfig>();
}
export const viaGeneric = useGeneric(services);

export const explicitVerb = services.addOptions("some:OptionsToken", "some:ElementToken");
const other = { addOptions<T>(): void {} } as { addOptions<T>(): void };
export const nonManifest = other.addOptions<{ a: number }>();

declare class IServiceManifest<S extends string = "singleton"> {
  addOptions<T>(): { as(scope: S): void };
}
declare const local: IServiceManifest<"singleton">;
export const viaLocalName = local.addOptions<AppConfig>();

declare const nested: Nested.IServiceManifestBase;
export const viaNamespace = nested.addOptions<AppConfig>();
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
        plugins: [{ transform: '@rhombus-std/di.transformer.options/ttsc' }],
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
  // Prefer the emitted dist JS when ttsc wrote it; otherwise read the transform
  // envelope ttsc surfaces on stdout.
  try {
    app = readFileSync(join(projDir, 'dist', 'app.js'), 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    app = envelope.typescript['src/app.ts'] ?? '';
  }
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('ttsc/Go addOptions<T>() lowering byte-parity', () => {
  test('app-internal element → wrapper over rootless element token', () => {
    expect(app).toContain(
      `addOptions("@rhombus-std/options:IOptions<./app:AppConfig>", "./app:AppConfig")`,
    );
    // No manifest sugar call keeps its `<T>` type argument (the `declare class`
    // overloads and the untouched non-manifest call below legitimately do).
    expect(app).not.toContain('services.addOptions<');
  });

  test('the .as() continuation survives the rewrite', () => {
    expect(app).toContain(`.as("singleton")`);
  });

  test('package-public element → wrapper over Tier-1 import-specifier token', () => {
    expect(app).toContain(
      `addOptions("@rhombus-std/options:IOptions<your-lib/contracts:IFoo>", "your-lib/contracts:IFoo")`,
    );
  });

  test('every receiver whose addOptions resolves to di.core is lowered', () => {
    // Interface-typed variable, subinterface, class extends-merge, and generic
    // bound all lower over the app-internal element token.
    const wrapperCount = app.split('@rhombus-std/options:IOptions<./app:AppConfig>').length - 1;
    // appInternal + chained + viaSubinterface + viaClassMerge + viaGeneric = 5.
    expect(wrapperCount).toBe(5);
  });

  test('the explicit two-argument verb is left untouched', () => {
    expect(app).toContain(`addOptions("some:OptionsToken", "some:ElementToken")`);
  });

  test('a non-IServiceManifest and a merely same-named receiver are not lowered', () => {
    // The plain-object receiver and the local `IServiceManifest`-named class both
    // keep their `<T>` type argument — the old name-based matcher would have
    // wrongly lowered the latter.
    expect(app).toContain('other.addOptions<');
    expect(app).toContain('local.addOptions<');
    // Total wrappers: the 5 app-internal calls above + packagePublic (IFoo) = 6.
    const wrapperCount = app.split('@rhombus-std/options:IOptions<').length - 1;
    expect(wrapperCount).toBe(6);
  });

  test('an interface nested in a namespace inside di.core is not lowered', () => {
    // The nearest enclosing module scope is the `Nested` namespace, not the
    // `@rhombus-std/di.core` module — both engines reject it.
    expect(app).toContain('nested.addOptions<');
  });
});

import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Production-path e2e parity for the Go config transformer. Two authorities are
// exercised, both driven with the SAME Go toolchain ttsc itself uses:
//
//   1. The real ttsc (typescript-go) HOST, driven over a temp project wired
//      through the `@rhombus-std/config.transformer/ttsc` descriptor. With a
//      plugin configured, `ttsc -p` runs the transform stage and prints the
//      `{ typescript }` envelope to stdout (it writes no dist JS) — the exact
//      lowered source ttsc feeds to emit and that @ttsc/unplugin/bun consumes.
//      Lowering + OPTIONAL import injection/honoring are asserted against it.
//   2. The compiled Go SIDECAR run directly in transform project-mode. A raised
//      diagnostic makes the host exit non-zero and report through its own channel,
//      so the NonObjectRoot / UnsupportedType codes and the un-rewritten "no
//      silent partial" behavior are asserted against the sidecar's own envelope
//      (diagnostics array + typescript map), which is deterministic.
//
// The parity corpus these mirror is tests/config.transformer.test.
//
// Working tree + Go build `$WORK` live on the roomy home filesystem, NOT the small
// tmpfs `/tmp`: a cold typescript-go + ttsc plugin rebuild needs many hundreds of
// MB. The fixture paths are STABLE so the ttsc plugin cache survives across runs.
//
// This suite needs a Go toolchain that satisfies the transforms module floor
// (>= 1.26). `mise which go` can point at an older parallel install, so the newest
// >= 1.26 mise install is resolved explicitly; the suite self-skips when none is
// found. It is kept OUT of the default `bun run test` gate (script `test:e2e`).
// The toolchain is pinned via TTSC_GO_BINARY + GOTOOLCHAIN=local, with GOROOT
// deleted so the chosen binary resolves its own (the ambient GOROOT can be stale).

/** Resolve the newest mise Go install satisfying the module floor (>= 1.26). */
function resolveGo(): string {
  const candidates: string[] = [];
  const which = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim().length > 0) {
    candidates.push(which.stdout.trim());
  }
  const installs = join(homedir(), '.local', 'share', 'mise', 'installs', 'go');
  try {
    for (const version of readdirSync(installs)) {
      candidates.push(join(installs, version, 'bin', 'go'));
    }
  } catch {
    // No mise go installs directory; fall through to whatever `mise which` gave.
  }
  let best = '';
  let bestRank = 0;
  for (const candidate of candidates) {
    const out = spawnSync(candidate, ['version'], { encoding: 'utf8' });
    const match = out.status === 0 ? /go(\d+)\.(\d+)/.exec(out.stdout) : null;
    if (!match) {
      continue;
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major < 1 || (major === 1 && minor < 26)) {
      continue;
    }
    const rank = major * 1000 + minor;
    if (rank > bestRank) {
      bestRank = rank;
      best = candidate;
    }
  }
  return best;
}

const goBin = resolveGo();
const toolchainReady = goBin.length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const CONFIG_TR = join(REPO_ROOT, 'libraries', 'config.transformer');
const TRANSFORMS = join(REPO_ROOT, 'transforms');

const WORK_ROOT = join(homedir(), '.cache', 'fnioc-ttsc-config-e2e');
const projHappy = join(WORK_ROOT, 'happy');
const projDiag = join(WORK_ROOT, 'diag');
const sidecarBin = join(WORK_ROOT, 'sidecar', 'ttsc-std');
const goTmp = join(WORK_ROOT, 'gotmp');
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

/** A build env pinned to one self-consistent Go toolchain (see file header). */
function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = 'local';
  env.GOTMPDIR = goTmp;
  env.TTSC_GO_BINARY = goBin;
  return env;
}

/** Wire a project's node_modules to the shared toolchain + a fake config barrel. */
function setupProject(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  rmSync(join(dir, 'dist'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(CONFIG_TR, join(nm, '@rhombus-std', 'config.transformer'));

  // The ambient `@rhombus-std/config` module: OPTIONAL, the `ConfigBuilder`
  // class (its runtime value), and the same-name interface carrying `withType<U>()`
  // — the class/augment split the real package uses. The matcher anchors on the
  // interface's `withType` declaration inside this `declare module` block, so a
  // receiver is recognized because its `withType` resolves back here, not because
  // a type is symbol-named `ConfigBuilder`. A script `.d.ts` under `src/`
  // makes it an ambient declaration, resolvable without a node_modules package.
  writeFileSync(join(dir, 'src', 'config.ambient.d.ts'), CONFIG_AMBIENT);
}

const CONFIG_AMBIENT = `declare module "@rhombus-std/config" {
  export const OPTIONAL: unique symbol;
  export class ConfigBuilder<T = unknown> {
    add(source: unknown): this;
    withSchema(schema: unknown): ConfigBuilder<unknown>;
  }
  export interface ConfigBuilder<T = unknown> {
    withType<U>(): ConfigBuilder<U>;
  }
  export namespace Nested {
    export interface ConfigBuilder<T = unknown> {
      withType<U>(): ConfigBuilder<U>;
    }
  }
}
`;

const APP_HEADER = `import { ConfigBuilder } from "@rhombus-std/config";\n`;

function tsconfig(withPlugin: boolean): string {
  return JSON.stringify({
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
      ...(withPlugin ? { plugins: [{ transform: '@rhombus-std/config.transformer/ttsc' }] } : {}),
    },
    include: ['src/**/*'],
  });
}

type Envelope = {
  diagnostics?: Array<{ code: string; messageText: string; file: string | null; }>;
  typescript: Record<string, string>;
};

// The owner host selects stages from the manifest; drive it with just the
// config stage so it runs the withType->withSchema lowering (and nothing else).
const CONFIG_STAGE_MANIFEST = JSON.stringify([
  { config: {}, name: 'rhombusstd_config', stage: 'transform' },
]);

/** Run the compiled sidecar over a project in transform mode; parse its envelope. */
function runSidecar(dir: string): Envelope {
  const result = spawnSync(
    sidecarBin,
    ['transform', '--cwd', dir, '--tsconfig', join(dir, 'tsconfig.json'), '--plugins-json', CONFIG_STAGE_MANIFEST],
    { cwd: dir, encoding: 'utf8', env: goEnv() },
  );
  // Project mode returns exit 3 when any diagnostic is raised; the envelope is
  // still written to stdout, so parse regardless of exit code.
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(`sidecar envelope parse failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
}

let happyEnv: Envelope = { typescript: {} };
let diagEnv: Envelope = { typescript: {} };

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  mkdirSync(join(WORK_ROOT, 'sidecar'), { recursive: true });
  mkdirSync(goTmp, { recursive: true });

  // 0. The direct sidecar build below resolves the ttsc shim modules through the
  //    gitignored transforms/go.work; the sibling suites get theirs from the ttsc
  //    driver's own scratch workspace. CI runs tests before the Go-gates step that
  //    generates go.work, so provision it here when absent.
  if (!existsSync(join(TRANSFORMS, 'go.work'))) {
    const gen = spawnSync(
      'node',
      [join(REPO_ROOT, 'scripts', 'gen-go-work.mjs')],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    if (gen.status !== 0) {
      throw new Error(`gen-go-work failed:\n${gen.stdout}\n${gen.stderr}`);
    }
  }

  // 1. Build the Go owner host once (drives the deterministic diagnostics path).
  const build = spawnSync(
    goBin,
    ['build', '-o', sidecarBin, './cmd/ttsc-std'],
    { cwd: TRANSFORMS, encoding: 'utf8', env: goEnv() },
  );
  if (build.status !== 0) {
    throw new Error(`sidecar build failed:\n${build.stdout}\n${build.stderr}`);
  }

  // 2. HAPPY project — diagnostic-free lowering + injection fixtures, driven
  //    through the real ttsc host; its stdout is the transform envelope.
  setupProject(projHappy);
  const hsrc = join(projHappy, 'src');
  writeFileSync(
    join(hsrc, 'server.ts'),
    `${APP_HEADER}interface ServerConfig { host: string; port: number; ssl?: boolean }
export const b = new ConfigBuilder().withType<ServerConfig>();
`,
  );
  writeFileSync(
    join(hsrc, 'nested.ts'),
    `${APP_HEADER}interface AppConfig {
  Server: { Host: string; Port: number };
  Database: { Primary: { Host: string; PoolSize: number } };
}
export const b = new ConfigBuilder().withType<AppConfig>();
`,
  );
  writeFileSync(
    join(hsrc, 'flags.ts'),
    `${APP_HEADER}interface Flags { flag: boolean }
export const b = new ConfigBuilder().withType<Flags>();
`,
  );
  writeFileSync(
    join(hsrc, 'chain.ts'),
    `${APP_HEADER}interface Server { Host: string; Port: number }
declare const src: unknown;
export const b = new ConfigBuilder().add(src).withType<Server>();
class Other { withType<U>(): Other { return this; } }
interface OT { a: string }
export const o = new Other().withType<OT>();
`,
  );
  writeFileSync(
    join(hsrc, 'namespace.ts'),
    `import * as cfg from "@rhombus-std/config";
${APP_HEADER}void cfg;
interface T { ssl?: boolean }
export const b = new ConfigBuilder().withType<T>();
`,
  );
  writeFileSync(
    join(hsrc, 'aliased.ts'),
    `import { OPTIONAL as OPT } from "@rhombus-std/config";
${APP_HEADER}void OPT;
interface T { ssl?: boolean }
export const b = new ConfigBuilder().withType<T>();
`,
  );
  // Receiver shapes whose withType resolves back to the ambient interface: a
  // subinterface, a class carrying the empty extends-merge, and a generic bound.
  writeFileSync(
    join(hsrc, 'shapes.ts'),
    `${APP_HEADER}interface T { Host: string }
interface MySub extends ConfigBuilder {}
declare const sub: MySub;
export const viaSub = sub.withType<T>();
declare class MyBuilder {}
interface MyBuilder extends ConfigBuilder {}
declare const merged: MyBuilder;
export const viaMerge = merged.withType<T>();
export function useGeneric<B extends ConfigBuilder>(b: B) {
  return b.withType<T>();
}
`,
  );
  // A local class merely NAMED ConfigBuilder — no barrel import, so no
  // collision. The old name-based matcher WOULD have lowered it; declaration-site
  // matching does not (its withType resolves to a local class).
  writeFileSync(
    join(hsrc, 'localname.ts'),
    `class ConfigBuilder<T = unknown> {
  withType<U>(): ConfigBuilder<U> { return this as any; }
  withSchema(schema: unknown): ConfigBuilder<unknown> { return this as any; }
}
interface T { a: string }
export const b = new ConfigBuilder().withType<T>();
`,
  );
  // (f) a TRUE anonymous / structural object receiver — its withType resolves to a
  // type-literal member, not config's declare-module interface.
  writeFileSync(
    join(hsrc, 'anon.ts'),
    `interface T { host: string }
const bag = { withType<U>(): { schema: U } { return {} as any; } };
export const b = bag.withType<T>();
`,
  );
  // (i) a namespace-nested ConfigBuilder — the nearest enclosing module
  // scope is the \`Nested\` namespace, not the \`@rhombus-std/config\` module.
  writeFileSync(
    join(hsrc, 'nestedns.ts'),
    `import type { Nested } from "@rhombus-std/config";
interface T { host: string }
declare const nested: Nested.ConfigBuilder;
export const b = nested.withType<T>();
`,
  );
  writeFileSync(join(projHappy, 'tsconfig.json'), tsconfig(true));

  const host = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], {
    cwd: projHappy,
    encoding: 'utf8',
    env: goEnv(),
  });
  if (host.status !== 0) {
    throw new Error(`ttsc host failed (status ${host.status}):\n${host.stdout}\n${host.stderr}`);
  }
  try {
    happyEnv = JSON.parse(host.stdout) as Envelope;
  } catch {
    throw new Error(`ttsc host envelope parse failed:\n${host.stdout}\n${host.stderr}`);
  }

  // 3. DIAG project — each unsupported shape in its own file, driven through the
  //    sidecar directly (a raised diagnostic makes the host exit non-zero).
  setupProject(projDiag);
  const dsrc = join(projDiag, 'src');
  writeFileSync(
    join(dsrc, 'array.ts'),
    `${APP_HEADER}interface Bad { tags: string[] }
export const b = new ConfigBuilder().withType<Bad>();
`,
  );
  writeFileSync(
    join(dsrc, 'union.ts'),
    `${APP_HEADER}interface Bad { mode: string | number }
export const b = new ConfigBuilder().withType<Bad>();
`,
  );
  writeFileSync(
    join(dsrc, 'date.ts'),
    `${APP_HEADER}interface Bad { when: Date }
export const b = new ConfigBuilder().withType<Bad>();
`,
  );
  writeFileSync(
    join(dsrc, 'bareleaf.ts'),
    `${APP_HEADER}export const b = new ConfigBuilder().withType<string>();
`,
  );
  writeFileSync(join(projDiag, 'tsconfig.json'), tsconfig(false));
  diagEnv = runSidecar(projDiag);
}, COLD_BUILD_MS);

function happy(name: string): string {
  return happyEnv.typescript[`src/${name}.ts`] ?? '';
}

function diag(name: string): string {
  return diagEnv.typescript[`src/${name}.ts`] ?? '';
}

describe.skipIf(!toolchainReady)('ttsc/Go config withType->withSchema byte-parity', () => {
  // ── production emit path (real ttsc host transform envelope) ────────────────
  test('host: flat interface lowers to schema literal with OPTIONAL wrapper', () => {
    const server = happy('server');
    expect(server).toContain(`host: "string"`);
    expect(server).toContain(`port: "number"`);
    expect(server).toContain(`ssl: { [OPTIONAL]: "boolean" }`);
    expect(server).toContain('.withSchema(');
    expect(server).not.toContain('.withType');
  });

  test('host: injects the named OPTIONAL import when absent', () => {
    expect(happy('server')).toContain(`import { OPTIONAL } from "@rhombus-std/config"`);
  });

  test('host: nested objects recurse, casing preserved', () => {
    const nested = happy('nested');
    expect(nested).toContain(`Host: "string"`);
    expect(nested).toContain(`PoolSize: "number"`);
    expect(nested).toMatch(/Database:\s*\{\s*Primary:\s*\{/);
  });

  test('host: required boolean lowers to "boolean" (wide-boolean-before-union)', () => {
    expect(happy('flags')).toContain(`flag: "boolean"`);
  });

  test('host: no optional field means no injected import', () => {
    const flags = happy('flags');
    expect(flags).not.toContain(`import { OPTIONAL }`);
    expect(flags).toContain('.withSchema(');
  });

  test('host: receiver chain preserved, type argument dropped, non-builder untouched', () => {
    const chain = happy('chain');
    expect(chain).toMatch(/\.add\(src\)\s*\.withSchema\(/);
    expect(chain).toContain(`Host: "string"`);
    expect(chain).toContain(`Port: "number"`);
    expect(chain).not.toContain('withSchema<');
    // A non-ConfigBuilder `.withType` is left untouched.
    expect(chain).toContain('.withType<OT>()');
  });

  test('host: honors a namespace import (no injected import)', () => {
    const ns = happy('namespace');
    expect(ns).toContain(`ssl: { [cfg.OPTIONAL]: "boolean" }`);
    expect(ns).not.toContain(`import { OPTIONAL }`);
  });

  test('host: honors an aliased named import (no injected import)', () => {
    const al = happy('aliased');
    expect(al).toContain(`ssl: { [OPT]: "boolean" }`);
    expect(al).not.toContain(`import { OPTIONAL }`);
  });

  test('host: subinterface / extends-merge / generic receivers all lower', () => {
    const shapes = happy('shapes');
    // Every withType whose member resolves to the ambient interface lowers.
    expect(shapes).not.toContain('.withType<');
    const schemaCount = shapes.split('.withSchema(').length - 1;
    expect(schemaCount).toBe(3);
  });

  test('host: a local class merely NAMED ConfigBuilder is not lowered', () => {
    const local = happy('localname');
    // The old name-based matcher would have lowered this; declaration-site
    // matching leaves it untouched.
    expect(local).toContain('.withType<T>()');
    expect(local).not.toContain('.withSchema(');
  });

  test('host: (f) an anonymous/structural object receiver is not lowered', () => {
    const anon = happy('anon');
    expect(anon).toContain('bag.withType<T>()');
    expect(anon).not.toContain('.withSchema(');
  });

  test('host: (i) a namespace-nested ConfigBuilder is not lowered', () => {
    const nested = happy('nestedns');
    expect(nested).toContain('nested.withType<T>()');
    expect(nested).not.toContain('.withSchema(');
  });

  // ── hard diagnostics, no silent partial (sidecar envelope) ──────────────────
  test('sidecar: an array field raises UnsupportedType (992001) and is NOT rewritten', () => {
    expect((diagEnv.diagnostics ?? []).some((d) => d.code === '992001')).toBe(true);
    const array = diag('array');
    expect(array).toContain('.withType<Bad>()');
    expect(array).not.toContain('.withSchema(');
  });

  test('sidecar: a union field raises UnsupportedType (992001), left un-rewritten', () => {
    expect(diag('union')).not.toContain('.withSchema(');
    expect((diagEnv.diagnostics ?? []).some((d) => d.code === '992001')).toBe(true);
  });

  test('sidecar: a Date field is unsupported (library-global guard), left un-rewritten', () => {
    expect(diag('date')).not.toContain('.withSchema(');
  });

  test('sidecar: a bare-leaf type argument raises NonObjectRoot (992002)', () => {
    expect((diagEnv.diagnostics ?? []).some((d) => d.code === '992002')).toBe(true);
    const bare = diag('bareleaf');
    expect(bare).toContain('.withType<string>()');
    expect(bare).not.toContain('.withSchema(');
  });
});

import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const sidecarBin = join(WORK_ROOT, 'sidecar', 'ttsc-config');
const goTmp = join(WORK_ROOT, 'gotmp');
const COLD_BUILD_MS = 420_000;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; link targets are stable.
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

  // A minimal, resolvable `@rhombus-std/config` barrel exporting only OPTIONAL, so
  // fixtures that already import it (and the plugin's injected import) type-check.
  const cfg = join(nm, '@rhombus-std', 'config');
  mkdirSync(cfg, { recursive: true });
  writeFileSync(
    join(cfg, 'package.json'),
    JSON.stringify({
      name: '@rhombus-std/config',
      version: '0.0.0',
      types: './index.d.ts',
      exports: { '.': './index.js' },
    }),
  );
  writeFileSync(join(cfg, 'index.d.ts'), `export declare const OPTIONAL: unique symbol;\n`);
  writeFileSync(join(cfg, 'index.js'), `export const OPTIONAL = Symbol("OPTIONAL");\n`);
}

const BUILDER_STUB = `export class ConfigurationBuilder<T = unknown> {
  add(source: unknown): this { return this; }
  withType<U>(): ConfigurationBuilder<U> { return this as any; }
  withSchema(schema: unknown): ConfigurationBuilder<unknown> { return this as any; }
}
`;

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
  diagnostics?: { code: string; messageText: string; file: string | null; }[];
  typescript: Record<string, string>;
};

/** Run the compiled sidecar over a project in transform mode; parse its envelope. */
function runSidecar(dir: string): Envelope {
  const result = spawnSync(
    sidecarBin,
    ['transform', '--cwd', dir, '--tsconfig', join(dir, 'tsconfig.json')],
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

  // 1. Build the Go sidecar once (drives the deterministic diagnostics path).
  const build = spawnSync(
    goBin,
    ['build', '-o', sidecarBin, './cmd/ttsc-config'],
    { cwd: TRANSFORMS, encoding: 'utf8', env: goEnv() },
  );
  if (build.status !== 0) {
    throw new Error(`sidecar build failed:\n${build.stdout}\n${build.stderr}`);
  }

  // 2. HAPPY project — diagnostic-free lowering + injection fixtures, driven
  //    through the real ttsc host; its stdout is the transform envelope.
  setupProject(projHappy);
  const hsrc = join(projHappy, 'src');
  writeFileSync(join(hsrc, 'config-builder.ts'), BUILDER_STUB);
  writeFileSync(
    join(hsrc, 'server.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface ServerConfig { host: string; port: number; ssl?: boolean }
export const b = new ConfigurationBuilder().withType<ServerConfig>();
`,
  );
  writeFileSync(
    join(hsrc, 'nested.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface AppConfig {
  Server: { Host: string; Port: number };
  Database: { Primary: { Host: string; PoolSize: number } };
}
export const b = new ConfigurationBuilder().withType<AppConfig>();
`,
  );
  writeFileSync(
    join(hsrc, 'flags.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface Flags { flag: boolean }
export const b = new ConfigurationBuilder().withType<Flags>();
`,
  );
  writeFileSync(
    join(hsrc, 'chain.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface Server { Host: string; Port: number }
declare const src: unknown;
export const b = new ConfigurationBuilder().add(src).withType<Server>();
class Other { withType<U>(): Other { return this; } }
interface OT { a: string }
export const o = new Other().withType<OT>();
`,
  );
  writeFileSync(
    join(hsrc, 'namespace.ts'),
    `import * as cfg from "@rhombus-std/config";
import { ConfigurationBuilder } from "./config-builder";
void cfg;
interface T { ssl?: boolean }
export const b = new ConfigurationBuilder().withType<T>();
`,
  );
  writeFileSync(
    join(hsrc, 'aliased.ts'),
    `import { OPTIONAL as OPT } from "@rhombus-std/config";
import { ConfigurationBuilder } from "./config-builder";
void OPT;
interface T { ssl?: boolean }
export const b = new ConfigurationBuilder().withType<T>();
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
  writeFileSync(join(dsrc, 'config-builder.ts'), BUILDER_STUB);
  writeFileSync(
    join(dsrc, 'array.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface Bad { tags: string[] }
export const b = new ConfigurationBuilder().withType<Bad>();
`,
  );
  writeFileSync(
    join(dsrc, 'union.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface Bad { mode: string | number }
export const b = new ConfigurationBuilder().withType<Bad>();
`,
  );
  writeFileSync(
    join(dsrc, 'date.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
interface Bad { when: Date }
export const b = new ConfigurationBuilder().withType<Bad>();
`,
  );
  writeFileSync(
    join(dsrc, 'bareleaf.ts'),
    `import { ConfigurationBuilder } from "./config-builder";
export const b = new ConfigurationBuilder().withType<string>();
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
    // A non-ConfigurationBuilder `.withType` is left untouched.
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

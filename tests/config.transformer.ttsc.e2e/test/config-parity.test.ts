import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the config.transformer INLINE + schemaof lowering, the
// sole path now that the bespoke config stage is deleted (W6p3). It drives the real
// ttsc (typescript-go) HOST over a temp project wired through the
// `@rhombus-std/config.transformer/ttsc` descriptor against a REAL resolvable
// @rhombus-std/config package: the declare-by-depending scan activates inline +
// schemaof, the config.transformer body substitutes `.withType<T>()` ->
// `this.withSchema(schemaof<T>())`, and schemaof lowers it to the runtime schema
// literal. `ttsc -p` prints the `{ typescript }` envelope to stdout (it writes no
// dist JS) — the exact lowered source @ttsc/unplugin/bun consumes. Lowering, OPTIONAL
// import injection, and receiver-shape discrimination are asserted against it.
//
// The schemaof≡config byte-parity and the 992001/992002 rejection table (formerly
// this suite's config-stage oracle + direct-sidecar diagnostics projects) are frozen
// at the Go tier: transforms/internal/schemaoftransform parity_test.go. The parity
// corpus these mirror is tests/config.transformer.test.
//
// The working tree lives per-worktree OUTSIDE the repo tree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname> — it must sit outside any
// enclosing package.json or ttsc re-roots its token derivation to that package,
// and keying on the worktree dir name keeps concurrent sessions from colliding.
// Go build `$WORK` and the content-keyed ttsc plugin cache live on the shared home
// filesystem (~/.cache/fnioc-ttsc), NOT the per-user-quota tmpfs `/tmp` — a cold
// typescript-go + ttsc plugin rebuild needs many hundreds of MB, and sharing the
// cache pays that cold compile once per machine, not once per suite.
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

// The working tree is per-worktree and OUTSIDE the repo tree (an enclosing
// package.json re-roots token derivation; a fixed global home path collided across
// concurrent sessions — the worktree dir name fixes both). The plugin cache + Go
// scratch are shared machine-wide and content-keyed, default-if-unset so CI or a
// shell can override.
const WORK_ROOT = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'config');
// The inline-path consumer: a REAL resolvable @rhombus-std/config package + a
// consumer package.json, so the host's declare-by-depending scan activates the
// full stage set (inline + schemaof) and the config.transformer inline body
// substitutes `.withType<T>()` -> `this.withSchema(schemaof<T>())`, which the
// schemaof stage lowers. This is the SOLE lowering path now that the bespoke
// config stage is deleted (W6p3); the ambient-mock config-stage oracle + its
// direct-sidecar rejection projects were removed — their schemaof≡config
// byte-parity and 992001/992002 rejection table are frozen at the Go tier
// (transforms/internal/schemaoftransform parity_test.go).
const projInline = join(WORK_ROOT, 'inline');
const goTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
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
  env.TTSC_CACHE_DIR = ttscCache;
  // Setting GOCACHE — even to Go's own default path — flips ttsc from a private
  // object cache under TTSC_CACHE_DIR to the ambient one, sharing compiled
  // objects with the transforms Go gates: a cold sidecar build mostly re-links.
  env.GOCACHE = process.env.GOCACHE ?? join(homedir(), '.cache', 'go-build');
  env.TTSC_GO_BINARY = goBin;
  return env;
}

const APP_HEADER = `import { ConfigBuilder } from "@rhombus-std/config";\n`;

// A REAL resolvable @rhombus-std/config package (a .d.ts module + a stub .js), so
// the consumer import resolves AND the inline stage's witness resolves the module —
// unlike the ambient-only happy/diag projects, where an empty dependency scan
// leaves inline inert. `withType<U>()` merges onto the class via a TOP-LEVEL
// interface (NOT a `declare module` block), so the config-stage matcher — which
// requires the member declared inside `declare module '@rhombus-std/config'` —
// deliberately IGNORES it, while the config.transformer inline body still resolves
// it off the merged ConfigBuilder symbol. Any lowering here is therefore PROVABLY
// the inline + schemaof path, not the config-stage oracle.
const REAL_CONFIG_DTS = `export const OPTIONAL: unique symbol;
export class ConfigBuilder<T = unknown> {
  add(source: unknown): this;
  withSchema(schema: unknown): ConfigBuilder<unknown>;
}
export interface ConfigBuilder<T = unknown> {
  withType<U>(): ConfigBuilder<U>;
}
`;
const REAL_CONFIG_JS = `export class ConfigBuilder {}
export const OPTIONAL = Symbol("OPTIONAL");
`;
const REAL_CONFIG_PKG = JSON.stringify({
  name: '@rhombus-std/config',
  version: '0.0.0',
  type: 'module',
  types: './index.d.ts',
  main: './index.js',
  exports: { '.': { types: './index.d.ts', import: './index.js', default: './index.js' } },
});
const INLINE_CONSUMER_PKG = JSON.stringify({
  name: 'config-inline-consumer',
  version: '0.0.0',
  type: 'module',
  dependencies: {
    '@rhombus-std/config': '*',
    '@rhombus-std/config.transformer': '*',
  },
});

/** Wire the inline-path consumer: shared toolchain + a real @rhombus-std/config. */
function setupInlineProject(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std', 'config'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  // Clear src on reuse so a stale fixture from an earlier run (the `include`
  // glob would still compile it) never lingers.
  rmSync(join(dir, 'src'), { recursive: true, force: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  rmSync(join(dir, 'dist'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(CONFIG_TR, join(nm, '@rhombus-std', 'config.transformer'));

  // The real @rhombus-std/config package (written, not linked): a consumer import
  // and the inline witness both resolve it.
  writeFileSync(join(nm, '@rhombus-std', 'config', 'package.json'), REAL_CONFIG_PKG);
  writeFileSync(join(nm, '@rhombus-std', 'config', 'index.d.ts'), REAL_CONFIG_DTS);
  writeFileSync(join(nm, '@rhombus-std', 'config', 'index.js'), REAL_CONFIG_JS);
  // A consumer package.json so CollectProject scans deps and activates inline +
  // schemaof (the ambient-only projects have no package.json -> empty scan).
  writeFileSync(join(dir, 'package.json'), INLINE_CONSUMER_PKG);
}

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

let inlineEnv: Envelope = { typescript: {} };

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  mkdirSync(goTmp, { recursive: true });
  mkdirSync(ttscCache, { recursive: true });

  // 4. INLINE project — the config consumer shape, driven through the real ttsc
  //    host so the dependency scan activates inline + schemaof and the
  //    config.transformer body lowers `.withType<T>()` via the primitive path.
  setupInlineProject(projInline);
  const isrc = join(projInline, 'src');
  writeFileSync(
    join(isrc, 'server.ts'),
    `${APP_HEADER}interface ServerConfig { host: string; port: number; ssl?: boolean }
export const b = new ConfigBuilder().withType<ServerConfig>();
`,
  );
  writeFileSync(
    join(isrc, 'nested.ts'),
    `${APP_HEADER}interface AppConfig {
  Server: { Host: string; Port: number };
  Database: { Primary: { Host: string; PoolSize: number } };
}
export const b = new ConfigBuilder().withType<AppConfig>();
`,
  );
  writeFileSync(
    join(isrc, 'flags.ts'),
    `${APP_HEADER}interface Flags { flag: boolean }
export const b = new ConfigBuilder().withType<Flags>();
`,
  );
  // Receiver-discrimination positives (ported from the deleted config-stage
  // project): the inline body anchors on the REAL @rhombus-std/config
  // ConfigBuilder.withType member, so a builder chain and every ConfigBuilder-typed
  // receiver shape lowers. (Receiver NEGATIVES — a like-named local class, a
  // structural object — are covered at the Go tier by inlinetransform's
  // resolve_test/matcher_test: they carry a sugar-named `withType` call that the
  // inline stage's name-based INLINE_UNLOWERED_SUGAR sweep would flag on the emit
  // path, so they cannot ride an inline e2e fixture.)
  writeFileSync(
    join(isrc, 'chain.ts'),
    `${APP_HEADER}interface Server { Host: string; Port: number }
declare const src: unknown;
export const b = new ConfigBuilder().add(src).withType<Server>();
`,
  );
  writeFileSync(
    join(isrc, 'shapes.ts'),
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
  writeFileSync(join(projInline, 'tsconfig.json'), tsconfig(true));

  const inlineHost = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], {
    cwd: projInline,
    encoding: 'utf8',
    env: goEnv(),
  });
  if (inlineHost.status !== 0) {
    throw new Error(
      `inline ttsc host failed (status ${inlineHost.status}):\n${inlineHost.stdout}\n${inlineHost.stderr}`,
    );
  }
  try {
    inlineEnv = JSON.parse(inlineHost.stdout) as Envelope;
  } catch {
    throw new Error(`inline ttsc host envelope parse failed:\n${inlineHost.stdout}\n${inlineHost.stderr}`);
  }
}, COLD_BUILD_MS);

function inlined(name: string): string {
  return inlineEnv.typescript[`src/${name}.ts`] ?? '';
}

describe.skipIf(!toolchainReady)('ttsc/Go config withType->withSchema byte-parity', () => {
  // ── the inline + schemaof consumer path (real ttsc host, real config package) ──
  // The scan activates inline + schemaof; the config.transformer body substitutes
  // `.withType<T>()` -> `this.withSchema(schemaof<T>())` and the schemaof stage
  // lowers it to the SAME literal the config-stage oracle emits above. No
  // `schemaof(` survives the emit (the sweep would fail the build otherwise).
  test('inline: flat interface lowers through inline + schemaof to the schema literal', () => {
    const server = inlined('server');
    expect(server).toContain(`host: "string"`);
    expect(server).toContain(`port: "number"`);
    expect(server).toContain(`ssl: { [OPTIONAL]: "boolean" }`);
    expect(server).toContain('.withSchema(');
    expect(server).not.toContain('.withType');
    expect(server).not.toContain('schemaof');
  });

  test('inline: injects the named OPTIONAL import for a wrapped field', () => {
    expect(inlined('server')).toContain(`import { OPTIONAL } from "@rhombus-std/config"`);
  });

  test('inline: nested objects recurse, casing preserved', () => {
    const nested = inlined('nested');
    expect(nested).toContain(`Host: "string"`);
    expect(nested).toContain(`PoolSize: "number"`);
    expect(nested).toMatch(/Database:\s*\{\s*Primary:\s*\{/);
    expect(nested).not.toContain('schemaof');
  });

  test('inline: a required boolean lowers to "boolean", no injected import', () => {
    const flags = inlined('flags');
    expect(flags).toContain(`flag: "boolean"`);
    expect(flags).not.toContain(`import { OPTIONAL }`);
    expect(flags).toContain('.withSchema(');
    expect(flags).not.toContain('schemaof');
  });

  test('inline: builder chain preserved, add(src) kept, type argument dropped', () => {
    const chain = inlined('chain');
    expect(chain).toMatch(/\.add\(src\)\s*\.withSchema\(/);
    expect(chain).toContain(`Host: "string"`);
    expect(chain).toContain(`Port: "number"`);
    expect(chain).not.toContain('withSchema<');
    expect(chain).not.toContain('.withType');
    expect(chain).not.toContain('schemaof');
  });

  test('inline: subinterface / extends-merge / generic receivers all lower', () => {
    const shapes = inlined('shapes');
    expect(shapes).not.toContain('.withType<');
    const schemaCount = shapes.split('.withSchema(').length - 1;
    expect(schemaCount).toBe(3);
    expect(shapes).not.toContain('schemaof');
  });
});

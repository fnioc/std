import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Consumer-true e2e for the inline stage's MATCH anchor. Its sibling parity suite
// hand-declares the authoring overloads directly on the receiver interface, which
// is the one merge shape TypeScript folds into overloads — so it can never observe
// what a real consumer sees.
//
// A real consumer installs the authoring surface by importing the augmentation
// package, and the receiver then carries the sugar member through an `extends`
// clause on a member-map interface, alongside the token-taking member the
// abstractions package contributes the same way. Two `extends` clauses supplying
// one name do NOT fold into overloads: one wins the property lookup and the other
// is invisible to it, so a call the author wrote against the sugar can bind to the
// surviving sibling instead.
//
// That is the shape pinned here. The contract is that a call naming a marker
// member either lowers correctly or fails the build by name — a token-less
// registration must never ship quietly.
//
// The sandboxes resolve the BUILT packages (each library's rolled `.d.ts`), so the
// merge shape under test is the published one, not a fixture's approximation.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');

const SANDBOX_ROOT = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT));
const MERGED_DIR = join(SANDBOX_ROOT, 'consumer-merged');
const UNWIRED_DIR = join(SANDBOX_ROOT, 'consumer-unwired');

const COLD_BUILD_MS = 600_000;

const LIBRARY_LINKS: Array<[string, string]> = [
  ['di.core', join(REPO_ROOT, 'libraries', 'di.core')],
  ['di.extras', join(REPO_ROOT, 'libraries', 'di.extras')],
  ['primitives', join(REPO_ROOT, 'libraries', 'primitives')],
  ['primitives.extras', join(REPO_ROOT, 'libraries', 'primitives.extras')],
];

function link(target: string, linkPath: string): void {
  rmSync(linkPath, { force: true });
  symlinkSync(target, linkPath);
}

function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = 'local';
  const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
  mkdirSync(goBuildTmp, { recursive: true });
  env.GOTMPDIR = goBuildTmp;
  const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
  mkdirSync(ttscCache, { recursive: true });
  env.TTSC_CACHE_DIR = ttscCache;
  env.GOCACHE = process.env.GOCACHE ?? join(homedir(), '.cache', 'go-build');
  const miseGo = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
  if (miseGo.status === 0 && miseGo.stdout.trim()) {
    env.TTSC_GO_BINARY = miseGo.stdout.trim();
  }
  return env;
}

// The consumer installs the authoring surface the production way: a side-effect
// import of the augmentation package, which is also what mounts its runtime
// members. The receiver reaches BOTH the sugar `add<ServiceType>` and the
// token-taking `add` through the merged declarations, so the call site here is
// the one a build actually compiles.
const MERGED_SOURCE = `
import '@rhombus-std/di.extras';
import type { Manifest } from '@rhombus-std/di.core';

interface ILogger {}
class ConsoleLogger implements ILogger {}

declare const services: Manifest<'singleton'>;

export const registered = services.add<ILogger>(ConsoleLogger, 'singleton');
`;

// The same call with the authoring surface absent: the package declaring the sugar
// is on the dependency graph (so the marker entry is in play) but the consumer
// never imports it, leaving only the token-taking member on the receiver. The call
// cannot lower, and the build must say so.
const UNWIRED_SOURCE = `
import type { Manifest } from '@rhombus-std/di.core';

interface ILogger {}
class ConsoleLogger implements ILogger {}

declare const services: Manifest<'singleton'>;

export const registered = (services as any).addValue<ILogger>(new ConsoleLogger());
`;

function setupSandbox(dir: string, name: string, file: string, source: string): void {
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  for (const [pkg, target] of LIBRARY_LINKS) {
    link(target, join(nm, '@rhombus-std', pkg));
  }
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '0.0.0',
      dependencies: { '@rhombus-std/di.core': 'workspace:*', '@rhombus-std/di.extras': 'workspace:*' },
    }),
  );
  const src = join(dir, 'src');
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, file), source);
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ESNext'], strict: true, outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false,
        plugins: [{ transform: '@rhombus-std/di.extras/ttsc' }] },
      include: ['src/**/*'],
    }),
  );
}

type Diagnostic = { file: string; category: string; code: string; messageText: string; };
type Run = { status: number; emitted: string; diagnostics: Diagnostic[]; };

function runTtsc(dir: string, srcRel: string): Run {
  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8', env: goEnv() });
  // A run that ends in diagnostics writes its envelope to stderr rather than stdout.
  const envelope = String(result.stdout).trim() || String(result.stderr).trim();
  let parsed: { diagnostics?: Diagnostic[]; typescript?: Record<string, string>; } = {};
  try {
    parsed = JSON.parse(envelope) as typeof parsed;
  } catch {
    parsed = {};
  }
  let emitted = parsed.typescript?.[srcRel] ?? '';
  if (!emitted) {
    try {
      emitted = readFileSync(join(dir, 'dist', srcRel.replace(/^src\//, '').replace(/\.ts$/, '.js')), 'utf8');
    } catch {
      emitted = '';
    }
  }
  return { status: result.status ?? 1, emitted, diagnostics: parsed.diagnostics ?? [] };
}

let merged: Run = { status: 1, emitted: '', diagnostics: [] };
let unwired: Run = { status: 1, emitted: '', diagnostics: [] };

if (toolchainReady) {
  setupSandbox(MERGED_DIR, 'merged-app', 'merged.ts', MERGED_SOURCE);
  merged = runTtsc(MERGED_DIR, 'src/merged.ts');
  setupSandbox(UNWIRED_DIR, 'unwired-app', 'unwired.ts', UNWIRED_SOURCE);
  unwired = runTtsc(UNWIRED_DIR, 'src/unwired.ts');
}

/**
 * The const the sandbox's generated module declares for `spelling` — the exact
 * `Type.*` factory call a hand-writer would have spelled at the call site.
 * Fails loudly when no such const exists, so the spelling stays pinned byte for
 * byte even though the call site only carries a reference to it.
 */
function constFor(dir: string, spelling: string): string {
  const module = readFileSync(join(dir, 'dist', '__typefor__.js'), 'utf8');
  const match = new RegExp(`export const (\\$\\w+) = ${spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`).exec(module);
  if (match === null) {
    throw new Error(`no const spelled ${spelling} in:\n${module}`);
  }
  return match[1]!;
}

describe.skipIf(!toolchainReady)('inline stage — consumer merge shapes', () => {
  test('a member-map receiver lowers the sugar call to the token-taking member', () => {
    expect(merged.status).toBe(0);
    const line = merged.emitted.split('\n').find((l) => l.includes('registered'))?.trim();
    expect(line).toBeDefined();
    // The derived token leads, and everything the author wrote after the ctor
    // reaches the token-taking member in order.
    const logger = constFor(MERGED_DIR, 'Type.imported("ILogger", "merged-app/private/merged")');
    const loggerClass = constFor(MERGED_DIR, 'Type.imported("ConsoleLogger", "merged-app/private/merged")');
    const loggerCtorType = constFor(MERGED_DIR, `Type.ctor(${loggerClass}, [[]])`);
    expect(line).toMatch(new RegExp(`\\.add\\(\\s*${logger.replace('$', '\\$')}\\b`));
    expect(line).toContain(`ConsoleLogger, ${loggerCtorType}, 'singleton'`);
    expect(line).not.toContain('add<');
  });

  test('a token-less registration never ships: the ctor is never the first argument', () => {
    // The exact silent miss this suite exists for. The property lookup on a
    // two-member-map receiver can answer with the token-taking sibling, and a
    // matcher keyed on that answer drops the substitution while the type argument
    // is erased anyway — emitting a registration whose token slot holds a class.
    const line = merged.emitted.split('\n').find((l) => l.includes('registered'))?.trim();
    expect(line).toBeDefined();
    expect(line).not.toMatch(/\.add\(\s*ConsoleLogger/);
  });

  test('the sugar fails the build by name when the authoring surface is absent', () => {
    // Nothing can lower here, and passing the call through would emit a call
    // whose arguments are shifted. di.extras' own marker entry for `addValue`
    // resolves fine workspace-wide — the failure is at THIS call site: with no
    // merge into Manifest's surface, `.addValue<ILogger>(...)` never matches a
    // real overload, so the loop leaves it untouched. The emit sweep is what
    // catches a call this name- and arity-shaped surviving to the end of the
    // pass, and fails the build by name rather than shipping it quietly.
    expect(unwired.status).not.toBe(0);
    const named = unwired.diagnostics.filter((d) => d.code === 'INLINE_UNLOWERED_SUGAR');
    expect(named.length).toBeGreaterThan(0);
    for (const diagnostic of named) {
      expect(diagnostic.category).toBe('error');
      expect(diagnostic.messageText).toContain('addValue');
    }
  });
});

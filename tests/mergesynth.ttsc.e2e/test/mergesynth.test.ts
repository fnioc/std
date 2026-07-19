import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Production-path e2e for the #213 merge-strategy synthesis stage: drives the
// REAL ttsc over a temp project that DEPENDS ON @rhombus-std/primitives.transformer
// (no explicit tsconfig plugins). ttsc's auto-discovery spawns the single owner
// host (transforms/cmd/ttsc-std) from that dep, and the host self-selects its
// stages from its own dependency scan — primitives.transformer's ttsc.stages
// carries mergesynth alongside inline/nameof/signatureof — exactly as a real
// augmentation package activates it. It then proves the feature three ways:
//
//   1. the emitted JS carries the INLINED typia guards (plain JS, no typia
//      import or reference of any kind — typia is build-time-only) and threads a
//      merge-strategies map as the third `registerAugmentations` argument;
//   2. at RUNTIME (against the real @rhombus-std/primitives registry), two
//      colliding augmentations dispatch by argument shape, a hand-authored
//      strategy wins over synthesis, an un-derivable member falls back to
//      extension-wins, and — the headline — a strategy-less collision that
//      throws under the no-transformer runtime no longer throws;
//   3. the nameof stage still lowers byte-identical tokens (same stage code, now
//      the one owner binary rather than a full-host sibling).
//
// The fixture path is STABLE (not mkdtemp) so the project-local ttsc plugin
// cache survives across runs: the first run pays the cold Go build of the owner
// host (typescript-go + typia — several minutes), later runs are instant.
//
// This suite needs the Go toolchain, so it is kept OUT of the default
// `bun run test` gate (script `test:e2e`, not `test`) and self-skips when go
// is not resolvable — run it deliberately with `bun run --filter '*' test:e2e`.

const goToolchain = spawnSync('mise', ['which', 'go'], { encoding: 'utf8' });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const TTSC = join(PKG_ROOT, 'node_modules', 'ttsc', 'lib', 'launcher', 'ttsc.js');
const TS7 = join(PKG_ROOT, 'node_modules', 'typescript');
const UNPLUGIN = join(PKG_ROOT, 'node_modules', '@ttsc', 'unplugin');
const PRIM_TRANSFORMER = join(REPO_ROOT, 'libraries', 'primitives.transformer');
const PRIMITIVES = join(REPO_ROOT, 'libraries', 'primitives');

const projDir = join(tmpdir(), 'fnioc-ttsc-mergesynth-e2e');
const COLD_BUILD_MS = 600_000;

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
  // Redirect `go build`'s scratch off a size-capped tmpfs /tmp — the full host
  // compiles the typescript-go checker AND typia's programmers.
  const goTmp = join(homedir(), '.cache', 'fnioc-ttsc-build-tmp');
  mkdirSync(goTmp, { recursive: true });
  env.GOTMPDIR = goTmp;
  return env;
}

// The collision fixture: one token, four registrations exercising each
// synthesis contract. Tokens are inline nameof calls (lowered by the full
// host's nameof stage); the registry and installer are the REAL
// @rhombus-std/primitives runtime.
const APP_SOURCE = `
import { augment, registerAugmentations, type MergeStrategies } from "@rhombus-std/primitives";
import { nameof } from "./nameof";

export interface IAlpha {}

// First holder of both names: mounts as plain thunks (no collision yet).
export const AlphaExtensions = {
  describe(self: IAlpha, opts: { verbose: boolean } | number): string {
    return typeof opts === "number" ? \`A:number:\${opts}\` : \`A:object:\${String(opts.verbose)}\`;
  },
  pick(self: IAlpha, value: string): string {
    return \`A:pick:\${value}\`;
  },
};

// Collides on describe with a DIFFERENT argument shape — under the transformer
// the synthesized guard routes strings here, everything else falls through.
// Under the no-transformer runtime this registration THROWS (strategy-less
// collision); this module importing cleanly IS the no-throw proof.
export const BetaExtensions = {
  describe(self: IAlpha, tag: string): string {
    return \`B:string:\${tag}\`;
  },
};

// Un-derivable parameter (unknown): always-pass fallback — this extension wins
// every pick call, chain order breaking the tie.
export const DeltaExtensions = {
  pick(self: IAlpha, value: unknown): string {
    return "D:pick";
  },
};

// Hand-authored strategy for describe: synthesis must SKIP the covered name
// and the hand strategy decides the merge (wrap-the-chain, not shape-routed).
// The uncovered sibling member (label) forces the gap-fill shape: a
// synthesized map with the hand-authored object spread LAST over it.
export const GammaExtensions = {
  describe(self: IAlpha, flag: boolean): string {
    return \`G:bool:\${String(flag)}\`;
  },
  label(self: IAlpha, n: number): string {
    return \`G:label:\${n}\`;
  },
};
const gammaMerge = {
  describe(original, _extension) {
    return function(this: IAlpha, ...args: unknown[]) {
      return \`HAND:\${String(original.call(this, ...args))}\`;
    };
  },
} satisfies MergeStrategies;

// Arity discrimination: same leading parameter type, different arity.
export const EpsilonExtensions = {
  fmt(self: IAlpha, a: number, b: string): string {
    return \`E:\${a}:\${b}\`;
  },
};
export const ZetaExtensions = {
  fmt(self: IAlpha, a: number): string {
    return \`Z:\${a}\`;
  },
};

registerAugmentations(nameof<IAlpha>(), AlphaExtensions);
registerAugmentations(nameof<IAlpha>(), BetaExtensions);
registerAugmentations(nameof<IAlpha>(), DeltaExtensions);
registerAugmentations(nameof<IAlpha>(), GammaExtensions, gammaMerge);
registerAugmentations(nameof<IAlpha>(), EpsilonExtensions);
registerAugmentations(nameof<IAlpha>(), ZetaExtensions);

export class Alpha implements IAlpha {}
augment(nameof<IAlpha>())(Alpha);
`;

let app = '';
let instance: Record<string, (...args: unknown[]) => unknown>;

beforeAll(async () => {
  if (!toolchainReady) {
    return;
  }

  // The fixture types AND runs against the real primitives package (its dist
  // is what both the ttsc typecheck and the runtime import resolve). Build it
  // when absent so the suite is self-sufficient after a fresh clone.
  if (!existsSync(join(PRIMITIVES, 'dist', 'index.js'))) {
    const build = spawnSync('bun', ['run', 'build'], { cwd: PRIMITIVES, encoding: 'utf8' });
    if (build.status !== 0) {
      throw new Error(`primitives build failed:\n${build.stdout}\n${build.stderr}`);
    }
  }

  const nm = join(projDir, 'node_modules');
  mkdirSync(join(nm, '@rhombus-std'), { recursive: true });
  mkdirSync(join(nm, '@ttsc'), { recursive: true });
  mkdirSync(join(projDir, 'src'), { recursive: true });
  rmSync(join(projDir, 'dist'), { recursive: true, force: true });

  link(TS7, join(nm, 'typescript'));
  link(join(PKG_ROOT, 'node_modules', 'ttsc'), join(nm, 'ttsc'));
  link(UNPLUGIN, join(nm, '@ttsc', 'unplugin'));
  link(PRIM_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.transformer'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));

  writeFileSync(join(projDir, 'src', 'nameof.ts'), `export declare function nameof<T>(): string;\n`);
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);
  // A fixture package.json declaring the primitives.transformer devDep: ttsc's
  // auto-discovery reads it, finds the ttsc.plugin marker, and spawns the one
  // owner host. The host then self-selects its stages from its own dependency
  // scan — primitives.transformer's ttsc.stages carries mergesynth — exactly as a
  // real augmentation package does. No tsconfig `plugins` array (an explicit list
  // would suppress discovery and never spawn the host).
  writeFileSync(
    join(projDir, 'package.json'),
    JSON.stringify({
      name: '@fixture/mergesynth-consumer',
      private: true,
      devDependencies: {
        '@rhombus-std/primitives.transformer': '*',
        '@rhombus-std/primitives': '*',
      },
    }),
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
  let runtimeEntry = join(projDir, 'dist', 'app.js');
  try {
    app = readFileSync(runtimeEntry, 'utf8');
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string>; };
    app = envelope.typescript['src/app.ts'] ?? '';
    // Materialize the transformed TypeScript for the runtime half — bun
    // executes TS natively, so importing the pre-type-strip form runs the
    // exact code the emit stage would ship.
    runtimeEntry = join(projDir, 'dist', 'app.ts');
    mkdirSync(join(projDir, 'dist'), { recursive: true });
    writeFileSync(runtimeEntry, app);
  }
  if (app === '') {
    throw new Error(`no transformed app module in ttsc output:\n${result.stdout.slice(0, 2000)}`);
  }

  // Runtime half: import the transformed module (its "@rhombus-std/primitives"
  // import resolves through the fixture's own node_modules symlink to the SAME
  // real package instance this test could import — one registry).
  const mod = (await import(runtimeEntry)) as { Alpha: new() => object; };
  instance = new mod.Alpha() as Record<string, (...args: unknown[]) => unknown>;
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)('mergesynth on the collapsed host — emitted JS', () => {
  test('threads a synthesized merge map as the third argument', () => {
    // The strategy-less registrations gained an object-literal third argument
    // holding one strategy function per member.
    expect(app).toContain('describe: function (original, extension)');
    expect(app).toContain('pick: function (original, extension)');
    expect(app).toContain('fmt: function (original, extension)');
  });

  test('guards are inlined plain JS with zero typia trace (typia is build-time-only)', () => {
    // Deep structural guard bodies survive (typeof checks on the union arms)…
    expect(app).toContain('typeof');
    // …but nothing typia-shaped does: no import, no identifier, no call.
    expect(app).not.toContain('typia');
    expect(app).not.toContain('createIs');
  });

  test('hand-authored merge object is spread last over the synthesized map', () => {
    // Gamma's uncovered member is synthesized, the covered one is not, and the
    // hand-authored object spreads AFTER the synthesized entries so it also
    // wins at runtime.
    const synthesized = app.indexOf('label: function (original, extension)');
    const spread = app.indexOf('...gammaMerge');
    expect(synthesized).toBeGreaterThanOrEqual(0);
    expect(spread).toBeGreaterThan(synthesized);
  });

  test('nameof lowering is byte-identical on the collapsed host', () => {
    expect(app).toContain('"./app:IAlpha"');
    expect(app).not.toContain('nameof');
  });
});

describe.skipIf(!toolchainReady)('mergesynth on the collapsed host — runtime dispatch', () => {
  test('a strategy-less collision no longer throws at install time', () => {
    // The fixture module import in beforeAll already proved this — Beta's
    // describe collision (no hand strategy) refuses to install under the
    // no-transformer runtime. Reaching here with a working instance is the
    // assertion; keep an explicit probe for the report's sake.
    expect(typeof instance.describe).toBe('function');
  });

  test('colliding describe dispatches by argument shape', () => {
    // Gamma's hand strategy wraps the WHOLE prior chain (dispatcher order:
    // hand(Gamma) over guard(Beta) over thunk(Alpha)).
    expect(instance.describe(3)).toBe('HAND:A:number:3');
    expect(instance.describe('x')).toBe('HAND:B:string:x');
    expect(instance.describe({ verbose: true })).toBe('HAND:A:object:true');
    // Gamma's uncovered sibling member installed uncontested.
    expect(instance.label(5)).toBe('G:label:5');
  });

  test('un-derivable member falls back to extension-wins', () => {
    // Delta's unknown-typed pick gets the always-pass strategy: it wins every
    // call regardless of shape, chain order breaking the tie.
    expect(instance.pick('v')).toBe('D:pick');
    expect(instance.pick(123)).toBe('D:pick');
  });

  test('arity bounds discriminate same-typed leading parameters', () => {
    // Zeta (1-arg) mounted over Epsilon (2-arg): Zeta's guard caps arity at 1,
    // so the 2-argument call falls through to Epsilon.
    expect(instance.fmt(1)).toBe('Z:1');
    expect(instance.fmt(2, 's')).toBe('E:2:s');
  });
});

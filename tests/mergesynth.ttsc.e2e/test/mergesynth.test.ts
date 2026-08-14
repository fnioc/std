import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

// Production-path e2e for the #213 merge-strategy synthesis stage: drives the
// REAL ttsc over a temp project that DEPENDS ON @rhombus-std/primitives.extras
// (no explicit tsconfig plugins). ttsc's auto-discovery spawns the single owner
// host (transforms/cmd/ttsc-std) from that dep, and the host runs its WHOLE
// always-on stage table (W7 — no selection), mergesynth included as its one-shot
// pre-pass — exactly as a real augmentation package's build gets it. It then
// proves the feature three ways:
//
//   1. the emitted JS carries the INLINED typia guards (plain JS, no typia
//      import or reference of any kind — typia is build-time-only) and threads a
//      merge-strategies map as the third `registerAugmentations` argument;
//   2. at RUNTIME (against the real @rhombus-std/primitives registry), two
//      colliding augmentations dispatch by argument shape, a hand-authored
//      strategy wins over synthesis, an un-derivable member falls back to
//      extension-wins, and — the headline — a strategy-less collision that
//      throws under the no-transformer runtime no longer throws;
//   3. the typefor stage still lowers byte-identical types (same stage code, now
//      the one owner binary rather than a full-host sibling).
//
// The throwaway project lives OUTSIDE the repo tree, per-worktree, at
// ~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>: it must sit outside any
// enclosing package.json, or ttsc re-roots token derivation to that package. Keying
// on the worktree dir name keeps concurrent sessions in different worktrees from
// colliding, and off /tmp (a per-user-quota tmpfs here). The ttsc plugin cache is
// content-keyed and shared machine-wide at ~/.cache/fnioc-ttsc/cache, so the cold
// Go build of the owner host (typescript-go + typia — several minutes) is paid once
// per machine, not once per suite.
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
const PRIM_TRANSFORMER = join(REPO_ROOT, 'libraries', 'primitives.extras');
const PRIMITIVES = join(REPO_ROOT, 'libraries', 'primitives');

// Outside the repo tree (see the header: an enclosing package.json re-roots token
// derivation), keyed by the worktree dir name so concurrent sessions don't collide.
const projDir = join(homedir(), '.cache', 'fnioc-ttsc', 'sandboxes', basename(REPO_ROOT), 'mergesynth');
// The plugin cache (keyed sidecar binaries) and the Go build scratch/object cache
// are content-keyed, so one machine-wide location is shared across every suite,
// worktree, and session. Default-if-unset so CI or a shell can override.
const ttscCache = process.env.TTSC_CACHE_DIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'cache');
const goBuildTmp = process.env.GOTMPDIR ?? join(homedir(), '.cache', 'fnioc-ttsc', 'gotmp');
const COLD_BUILD_MS = 600_000;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; link targets are stable.
  }
}

/** A build env with a single self-consistent Go toolchain (see the typefor e2e). */
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
  // Redirect `go build`'s scratch off the per-user-quota tmpfs /tmp — the full
  // host compiles the typescript-go checker AND typia's programmers — and pin the
  // content-keyed plugin cache to the same shared home dir so the sidecar builds
  // once per machine, not once per suite sandbox.
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

// The collision fixture: one interface, four registrations exercising each
// synthesis contract. The tokens are inline typefor calls (lowered by the full
// host's typefor stage); the registry and installer are the REAL
// @rhombus-std/primitives runtime.
const APP_SOURCE = `
import { augment, registerAugmentations, type MergeStrategies } from "@rhombus-std/primitives";
import { typefor } from "./typefor";

export interface IAlpha {}

// First holder of both names: mounts verbatim (no collision yet).
export const AlphaExtensions = {
  describe(opts: { verbose: boolean } | number): string {
    return typeof opts === "number" ? \`A:number:\${opts}\` : \`A:object:\${String(opts.verbose)}\`;
  },
  pick(value: string): string {
    return \`A:pick:\${value}\`;
  },
};

// Collides on describe with a DIFFERENT argument shape — under the transformer
// the synthesized guard routes strings here, everything else falls through.
// Under the no-transformer runtime this registration THROWS (strategy-less
// collision); this module importing cleanly IS the no-throw proof.
export const BetaExtensions = {
  describe(tag: string): string {
    return \`B:string:\${tag}\`;
  },
};

// Un-derivable parameter (unknown): always-pass fallback — this extension wins
// every pick call, chain order breaking the tie.
export const DeltaExtensions = {
  pick(value: unknown): string {
    return "D:pick";
  },
};

// Hand-authored strategy for describe: synthesis must SKIP the covered name
// and the hand strategy decides the merge (wrap-the-chain, not shape-routed).
// The uncovered sibling member (label) forces the gap-fill shape: a
// synthesized map with the hand-authored object spread LAST over it.
export const GammaExtensions = {
  describe(flag: boolean): string {
    return \`G:bool:\${String(flag)}\`;
  },
  label(n: number): string {
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
  fmt(a: number, b: string): string {
    return \`E:\${a}:\${b}\`;
  },
};
export const ZetaExtensions = {
  fmt(a: number): string {
    return \`Z:\${a}\`;
  },
};

// A class whose public surface is accessors over #private backing fields — a
// #private field is not a string-keyed property at runtime, so a guard keyed on
// one can never be false. The guard must key on the accessors instead.
export class EntryOptions {
  #absoluteExpirationRelativeToNow: number | undefined = undefined;
  public get absoluteExpirationRelativeToNow(): number | undefined {
    return this.#absoluteExpirationRelativeToNow;
  }
  public set absoluteExpirationRelativeToNow(value: number | undefined) {
    this.#absoluteExpirationRelativeToNow = value;
  }
  public label: string = "";
  private internal: number = 0;
}

// First holder: mounts verbatim, so it is what a failed guard falls
// through to.
export const EtaExtensions = {
  setOptions(tag: string): string {
    return \`ETA:\${String(tag)}\`;
  },
};
// Collides on setOptions with the accessor-bearing class as its parameter.
export const ThetaExtensions = {
  setOptions(options: EntryOptions): string {
    return \`THETA:\${String(options.label)}\`;
  },
};

// The same class reached ONLY through a record's value type — a position no
// property or type-argument walk passes through.
export const IotaExtensions = {
  configure(tag: string): string {
    return \`IOTA:\${tag}\`;
  },
};
export const KappaExtensions = {
  configure(bag: Record<string, EntryOptions>): string {
    return \`KAPPA:\${Object.keys(bag).join(",")}\`;
  },
};

// A Map carrying a diverging value type: checked the way a hand-written guard
// checks a Map — \`instanceof\` plus its entries — so a non-Map argument still
// falls through to the plain member that held the name first.
export const LambdaExtensions = {
  store(tag: string): string {
    return \`LAMBDA:\${String(tag)}\`;
  },
};
export const MuExtensions = {
  store(entries: Map<string, EntryOptions>): string {
    return "MU";
  },
};

// A type nothing structural can recognize. Its guard drops to the object floor,
// which still rejects a value of the wrong runtime kind, and the arity bounds
// stand on top of it.
export const NuExtensions = {
  fetch(tag: string): string {
    return \`NU:\${String(tag)}\`;
  },
};
export const XiExtensions = {
  fetch(pending: Promise<EntryOptions>): string {
    return "XI";
  },
};

registerAugmentations(typefor<IAlpha>(), AlphaExtensions);
registerAugmentations(typefor<IAlpha>(), BetaExtensions);
registerAugmentations(typefor<IAlpha>(), DeltaExtensions);
registerAugmentations(typefor<IAlpha>(), GammaExtensions, gammaMerge);
registerAugmentations(typefor<IAlpha>(), EpsilonExtensions);
registerAugmentations(typefor<IAlpha>(), ZetaExtensions);
registerAugmentations(typefor<IAlpha>(), EtaExtensions);
registerAugmentations(typefor<IAlpha>(), ThetaExtensions);
registerAugmentations(typefor<IAlpha>(), IotaExtensions);
registerAugmentations(typefor<IAlpha>(), KappaExtensions);
registerAugmentations(typefor<IAlpha>(), LambdaExtensions);
registerAugmentations(typefor<IAlpha>(), MuExtensions);
registerAugmentations(typefor<IAlpha>(), NuExtensions);
registerAugmentations(typefor<IAlpha>(), XiExtensions);

export class Alpha implements IAlpha {}
augment(typefor<IAlpha>())(Alpha);
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
  link(PRIM_TRANSFORMER, join(nm, '@rhombus-std', 'primitives.extras'));
  link(PRIMITIVES, join(nm, '@rhombus-std', 'primitives'));

  // Untyped `any` return (rather than `unknown`, which the other typefor e2e
  // stubs use) — here the call feeds registerAugmentations/augment's
  // `string | Type` parameter directly, and the stage matches by callee symbol
  // name alone, so the stub's declared type only needs to satisfy the checker.
  writeFileSync(join(projDir, 'src', 'typefor.ts'), `export declare function typefor<T>(): any;\n`);
  writeFileSync(join(projDir, 'src', 'app.ts'), APP_SOURCE);
  // A fixture package.json declaring the primitives.extras devDep: ttsc's
  // auto-discovery reads it, finds the ttsc.plugin marker, and spawns the one
  // owner host. The host runs its whole always-on stage table (W7 — no selection),
  // mergesynth included, exactly as a real augmentation package's build does. No
  // tsconfig `plugins` array (an explicit list would suppress discovery and never
  // spawn the host). Inline emission is pinned so every call site is a
  // self-contained assertion rather than a reference into a generated module.
  writeFileSync(join(projDir, 'package.json'),
    JSON.stringify({ name: '@fixture/mergesynth-consumer', private: true,
      devDependencies: { '@rhombus-std/primitives.extras': '*', '@rhombus-std/primitives': '*' },
      'rhombus-std': { typefor: { emit: 'inline' } } }));
  writeFileSync(join(projDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], strict: true,
      outDir: 'dist', rootDir: 'src', skipLibCheck: true, noEmitOnError: false },
    include: ['src/**/*'],
  }));

  const result = spawnSync('node', [TTSC, '-p', 'tsconfig.json'], { cwd: projDir, encoding: 'utf8', env: goEnv() });
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

  test('an accessor-bearing class is guarded on its accessors, never a #private key', () => {
    // The checker names a #private field with a mangled internal name whose
    // leading byte prints as the replacement character. No emitted artifact may
    // carry one, and the public accessor must be what the guard reads.
    expect(app).not.toContain('\uFFFD');
    expect(app).not.toContain('@#');
    expect(app).toContain('.absoluteExpirationRelativeToNow');
    // The `private`-modifier member is outside the public surface too.
    expect(app).not.toContain('.internal');
  });

  test('a record decomposes over its values rather than its own keys', () => {
    expect(app).toContain('Object.values(');
  });

  test('typefor lowering is byte-identical on the collapsed host', () => {
    expect(app).toContain('Type.imported("IAlpha", "@fixture/mergesynth-consumer/tokens/app")');
    expect(app).not.toContain('typefor');
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
    // hand(Gamma) over guard(Beta) over plain(Alpha)).
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

  test('an accessor-shaped argument is accepted and a wrong-shaped one is not', () => {
    // Theta's guard reads the PUBLIC accessor: an object carrying the public
    // shape dispatches to Theta…
    expect(instance.setOptions({ absoluteExpirationRelativeToNow: 5, label: 'x' })).toBe('THETA:x');
    expect(instance.setOptions({ absoluteExpirationRelativeToNow: undefined, label: 'y' })).toBe('THETA:y');
    // …and one whose accessor field holds the wrong type does not — it falls
    // through to Eta, the plain member that held the name first. Under a guard
    // keyed on the #private backing field this clause is `undefined === undefined`
    // and the wrong-shaped object dispatches to Theta.
    expect(instance.setOptions({ absoluteExpirationRelativeToNow: 'nope', label: 'x' })).toBe('ETA:[object Object]');
  });

  test('a record value is checked through the value type, not waved through', () => {
    // Kappa's guard reaches EntryOptions through the record's VALUE type: a bag
    // whose entry carries the public shape dispatches to Kappa…
    expect(instance.configure({ a: { absoluteExpirationRelativeToNow: 5, label: 'x' } })).toBe('KAPPA:a');
    // …and one whose entry holds the wrong type does not — it falls through to
    // Iota, the plain member that held the name first.
    expect(instance.configure({ a: { absoluteExpirationRelativeToNow: 'nope', label: 'x' } })).toBe(
      'IOTA:[object Object]',
    );
  });

  test('a Map parameter is checked nominally, not waved through', () => {
    // Mu's guard is `instanceof Map` plus its entries, so a real Map reaches it…
    expect(instance.store(new Map())).toBe('MU');
    // …and a single argument that is NOT a Map falls through to Lambda. Under a
    // refusal this clause is only `args.length === 1` and 'hello' reaches Mu.
    expect(instance.store('hello')).toBe('LAMBDA:hello');
    // The arity bounds stand alongside the guard.
    expect(instance.store()).toBe('LAMBDA:undefined');
    expect(instance.store('a', 'b')).toBe('LAMBDA:a');
  });

  test('a guard that had to drop to the object floor still narrows by runtime kind', () => {
    // Xi's parameter is a type nothing structural recognizes, so its guard is the
    // object floor: a promise (any object, in fact) reaches it…
    expect(instance.fetch(Promise.resolve({}))).toBe('XI');
    // …and a value of the wrong runtime kind does not. Dropping the floor makes
    // this dispatch to Xi.
    expect(instance.fetch('hello')).toBe('NU:hello');
    expect(instance.fetch(42)).toBe('NU:42');
    // The arity bounds survive on top of the floor.
    expect(instance.fetch()).toBe('NU:undefined');
    expect(instance.fetch('a', 'b')).toBe('NU:a');
  });

  test('arity bounds discriminate same-typed leading parameters', () => {
    // Zeta (1-arg) mounted over Epsilon (2-arg): Zeta's guard caps arity at 1,
    // so the 2-argument call falls through to Epsilon.
    expect(instance.fmt(1)).toBe('Z:1');
    expect(instance.fmt(2, 's')).toBe('E:2:s');
  });
});

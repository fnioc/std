// The single build entry point for every libraries/* package: each one's
// `build` script runs `bun ../../scripts/build-lib.ts` from its own directory,
// and this script derives the `buildPackage` arguments from the package's
// manifest instead of a per-package build.ts restating them.
//
// Derivation rules (each package's manifest is the source of truth):
//
//   - `external` = keys(dependencies) ∪ keys(peerDependencies). Every runtime
//     workspace dep MUST stay external or runtime identity forks: the
//     cross-package prototype-patched classes (`ServiceManifestClass`,
//     `ConfigurationBuilder`) and @rhombus-std/primitives' augmentation
//     registry (a module-level Map + event bus) are shared singletons -- a
//     private inlined copy splits them (docs/decisions.md §9/§38). Anything
//     NOT a dependency (i.e. a devDependency) is inlined -- which is how
//     @rhombus-std/config folds in @rhombus-toolkit/proxy-base (whose
//     published ESM uses extensionless relative imports Node's resolver
//     rejects; bundling resolves them).
//   - `entrypoints` = src/index.ts plus, for every exports subpath whose
//     `import` condition points at a non-index dist/*.js, the matching
//     src/*.ts (today: config's ./with-type-augment side-effect seam).
//   - `dtsConfigs` = one rollup config per JS entrypoint (rollup.dts.mjs, plus
//     rollup.<entry>.dts.mjs per extra entrypoint) -- the one-rolled-d.ts-per-
//     entry invariant, asserted by existence.
//   - lowering engine (docs/decisions.md §40/§41): tsconfig.build.json present
//     -> tspc (ts-patch), tsconfig.ttsc.json present -> ttsc (the Go engine).
//     A package holding BOTH (the §41 pilot keeps its tspc twin for the parity
//     invariant) must disambiguate via `rhombusBuild.lowering`.
//
// The optional `rhombusBuild` manifest field carries the few per-package
// overrides (each override package documents its why in a `//rhombusBuild`
// neighbor key):
//
//   | package            | field                                  | why                                              |
//   |--------------------|----------------------------------------|--------------------------------------------------|
//   | caching.core       | lowering: "ttsc"                       | §41 pilot; retained tspc twin makes both configs exist |
//   | config.core        | typesOnly: true                        | pure-types package -- no JS bundle, asserted (§40) |
//   | di.transformer     | inline: [primitives.transformer, func] | dist-parity carve-out -- its bespoke build inlined these; aligning to the rule is a follow-up |
//   | config.transformer | forbidImports: ["@rhombus-std/config"] | its bundle must be @rhombus-std-free -- the only "@rhombus-std/config" occurrence is the codegen'd import-specifier string |

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPackage } from './build-package';

interface RhombusBuild {
  /** Disambiguates the lowering engine when both twin configs exist (§41 pilot). */
  readonly lowering?: 'tspc' | 'ttsc';
  /** Pure-types package: emit no JS bundle and assert none appears (§40). */
  readonly typesOnly?: boolean;
  /** Names subtracted from the derived external set (bundled despite being deps). */
  readonly inline?: readonly string[];
  /** Specifiers that must not appear as real ESM imports in dist/index.js. */
  readonly forbidImports?: readonly string[];
}

interface Manifest {
  readonly name: string;
  readonly exports?: Record<string, string | Record<string, string>>;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly rhombusBuild?: RhombusBuild;
}

const dir = process.cwd();
const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
const overrides = manifest.rhombusBuild ?? {};

// Typecheck gate first -- the publish pipeline never runs tsc itself
// (bun build + rollup-plugin-dts), so this is where type errors fail the build.
const typecheck = spawnSync('bun', ['x', 'tsc', '--noEmit', '-p', 'tsconfig.json'], {
  cwd: dir,
  stdio: 'inherit',
});
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

// Entrypoints: src/index.ts + every exports subpath whose `import` condition
// is a non-index dist/*.js. (`_/*`, `./ttsc`, and bun-only subpaths all
// fail the test and are correctly ignored.)
const entrypoints = ['src/index.ts'];
const dtsConfigs = ['rollup.dts.mjs'];
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  if (subpath === '.' || typeof target === 'string') {
    continue;
  }
  const match = /^\.\/dist\/(?!index\.js$)(.+)\.js$/.exec(target.import ?? '');
  if (!match) {
    continue;
  }
  const entry = match[1]!;
  entrypoints.push(`src/${entry}.ts`);
  const dts = `rollup.${entry}.dts.mjs`;
  if (!existsSync(join(dir, dts))) {
    throw new Error(`${manifest.name}: extra entrypoint src/${entry}.ts has no ${dts} (one rolled d.ts per JS entry)`);
  }
  dtsConfigs.push(dts);
}

// External: deps ∪ peers, minus explicit inline overrides.
//
// @rhombus-toolkit/type-guards is ALWAYS inlined, repo policy rather than a
// per-package override: its published ESM uses extensionless relative imports
// plain Node rejects (the same defect that makes config inline
// @rhombus-toolkit/proxy-base), so it can never be a runtime external of any
// published bundle here -- the examples e2e runs the built app under node and
// fails with ERR_MODULE_NOT_FOUND the moment it is kept external. Inlining is
// safe: its exports are pure stateless functions (assertNever, the is*
// guards), so a private copy forks no identity. The manifest keeps the
// dependency entry for the type-level surface.
const inline = new Set(['@rhombus-toolkit/type-guards', ...(overrides.inline ?? [])]);
const external = [
  ...new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]),
].filter((name) => !inline.has(name));

// Lowering engine: by twin-config existence, disambiguated by the marker.
const hasTspc = existsSync(join(dir, 'tsconfig.build.json'));
const hasTtsc = existsSync(join(dir, 'tsconfig.ttsc.json'));
let tspcProject: string | undefined;
let ttscProject: string | undefined;
if (hasTspc && hasTtsc) {
  if (!overrides.lowering) {
    throw new Error(
      `${manifest.name}: both tsconfig.build.json and tsconfig.ttsc.json exist -- set rhombusBuild.lowering`,
    );
  }
  if (overrides.lowering === 'ttsc') {
    ttscProject = 'tsconfig.ttsc.json';
  } else {
    tspcProject = 'tsconfig.build.json';
  }
} else if (hasTtsc) {
  ttscProject = 'tsconfig.ttsc.json';
} else if (hasTspc) {
  tspcProject = 'tsconfig.build.json';
}

await buildPackage({
  dir,
  name: manifest.name,
  entrypoints,
  external,
  dtsConfigs,
  emitJs: !(overrides.typesOnly ?? false),
  assertNoJs: overrides.typesOnly ?? false,
  tspcProject,
  ttscProject,
});

// Guard: the emitted bundle must carry no real ESM import from the forbidden
// specifiers. A literal occurrence as a STRING (e.g. a transformer's codegen'd
// import specifier) is expected and fine; an actual `import ... from` is not --
// and since forbidden specifiers are peers (hence external), a real import
// SURVIVES bundling and is caught here instead of being silently inlined.
for (const specifier of overrides.forbidImports ?? []) {
  const bundle = readFileSync(join(dir, 'dist', 'index.js'), 'utf8');
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const realImport = new RegExp(`(^|\\n)\\s*import[^\\n]*from\\s*["']${escaped}`);
  if (realImport.test(bundle)) {
    throw new Error(
      `${manifest.name}: dist/index.js contains a real ESM import from ${specifier} -- `
        + 'the runtime bundle must not import it (only reference it as a string).',
    );
  }
}

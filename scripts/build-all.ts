// Topological build runner for the @rhombus-std workspace.
//
// `bun --filter '*' build` runs every package's build in PARALLEL with no
// ordering. That is fine for packages that consume their siblings from SOURCE
// (the `source`/`bun`/`types` export conditions point at `.ts`, always present),
// but WRONG for the transformer-active packages: `di.transformer` and
// `di.transformer.options` (plus the `tspc` example builds) resolve their
// upstream through the `built` export condition -- di's rolled `.d.ts`, not
// source (docs/decisions.md §1/§9). If that upstream dist is missing or being
// rewritten while they compile, the `built` condition silently falls back to
// `types` -> source, and the augmented core class fails its own augmented
// interface (TS2416/TS2420) -- the order-dependent, stale-dist failure this
// runner exists to remove.
//
// It topologically orders the per-package `build` scripts by their workspace
// dependency graph and runs each tier to completion before the next begins, so
// every `built`-condition consumer sees a complete, stable upstream dist. A
// tier's packages have no ordering between them and build in parallel (one
// `bun --filter` invocation per tier).

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  readonly name: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface Package {
  readonly name: string;
  readonly hasBuild: boolean;
  /** Workspace-sibling package names this one depends on (any dependency kind). */
  readonly deps: readonly string[];
}

const ROOT = join(import.meta.dir, '..');
// The workspace groups from the root package.json `workspaces` globs.
const GROUPS = ['libraries', 'examples', 'tests'];

/** Yields the workspace-protocol dependency names across every dependency kind. */
function* workspaceDeps(manifest: Manifest): Generator<string> {
  const fields = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
  for (const field of fields) {
    for (const [name, spec] of Object.entries(field ?? {})) {
      if (String(spec).startsWith('workspace:')) {
        yield name;
      }
    }
  }
}

/** Reads every workspace package's manifest into a name -> Package map. */
function discoverPackages(): Map<string, Package> {
  const packages = new Map<string, Package>();
  for (const group of GROUPS) {
    let entries: string[];
    try {
      entries = readdirSync(join(ROOT, group));
    } catch {
      continue;
    }
    for (const entry of entries) {
      let manifest: Manifest;
      try {
        manifest = JSON.parse(readFileSync(join(ROOT, group, entry, 'package.json'), 'utf8')) as Manifest;
      } catch {
        continue;
      }
      packages.set(manifest.name, {
        name: manifest.name,
        hasBuild: Boolean(manifest.scripts?.build),
        deps: [...new Set(workspaceDeps(manifest))],
      });
    }
  }
  return packages;
}

/**
 * Peels the graph into dependency tiers (Kahn's algorithm): tier 0 depends on
 * nothing in the workspace, tier N depends only on tiers < N. Throws on a cycle.
 */
function computeTiers(packages: Map<string, Package>): string[][] {
  const pending = new Map<string, Set<string>>();
  for (const pkg of packages.values()) {
    pending.set(pkg.name, new Set(pkg.deps.filter((dep) => packages.has(dep))));
  }

  const tiers: string[][] = [];
  while (pending.size) {
    const tier = [...pending].filter(([, deps]) => !deps.size).map(([name]) => name);
    if (!tier.length) {
      throw new Error(`build-all: dependency cycle among ${[...pending.keys()].join(', ')}`);
    }
    for (const name of tier) {
      pending.delete(name);
    }
    for (const deps of pending.values()) {
      for (const name of tier) {
        deps.delete(name);
      }
    }
    tiers.push(tier.sort());
  }
  return tiers;
}

const packages = discoverPackages();
const tiers = computeTiers(packages);

for (const tier of tiers) {
  const toBuild = tier.filter((name) => packages.get(name)?.hasBuild);
  if (!toBuild.length) {
    continue;
  }
  console.log(`\n▶ build tier: ${toBuild.join(', ')}`);
  const filters = toBuild.flatMap((name) => ['--filter', name]);
  const result = spawnSync('bun', [...filters, 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

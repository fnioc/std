// Topological build runner for the @rhombus-std workspace.
//
// In-repo resolution is source-first, so no package's typecheck or lowering
// stage reads a sibling's dist -- correctness no longer depends on build
// order. The tiers are kept for determinism: every package's publish
// artifacts are produced against a workspace whose upstream dists are
// complete rather than mid-rewrite, and a failure surfaces at the shallowest
// package that owns it instead of at whichever downstream build happened to
// race past it.
//
// It topologically orders the per-package `build` scripts by their workspace
// dependency graph and runs each tier to completion before the next begins. A
// tier's packages have no ordering between them and build in parallel (one
// `bun --filter` invocation per tier).

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

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
  /** Workspace-relative directory (`libraries/di.core`), for rewriting diagnostic paths. */
  readonly dir: string;
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
      packages.set(manifest.name, { name: manifest.name, hasBuild: Boolean(manifest.scripts?.build), dir: `${group}/${entry}`, deps: [...new Set(workspaceDeps(manifest))] });
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

const PREFIXED_LINE = /^(?<name>@\S+) build: (?<rest>.*)$/;
const TSC_DIAGNOSTIC = /^[^\s(][^(]*\(\d+,\d+\): (?:error|warning) TS\d+: /;

/**
 * Rewrites a `--filter`-prefixed tsc diagnostic onto its workspace-relative
 * path (`@x build: src/F.ts(1,2): error …` → `libraries/x/src/F.ts(1,2): error …`),
 * so an editor problem matcher can resolve the file. Every other line passes
 * through untouched, prefix and all.
 */
function rewrite(line: string): string {
  const prefixed = PREFIXED_LINE.exec(line);
  if (!prefixed?.groups) {
    return line;
  }
  const dir = packages.get(prefixed.groups.name!)?.dir;
  if (dir && TSC_DIAGNOSTIC.test(prefixed.groups.rest!)) {
    return `${dir}/${prefixed.groups.rest!}`;
  }
  return line;
}

for (const tier of tiers) {
  const toBuild = tier.filter((name) => packages.get(name)?.hasBuild);
  if (!toBuild.length) {
    continue;
  }
  console.log(`\n▶ build tier: ${toBuild.join(', ')}`);
  const filters = toBuild.flatMap((name) => ['--filter', name]);
  const child = spawn('bun', [...filters, 'build'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  createInterface({ input: child.stdout }).on('line', (line) => {
    console.log(rewrite(line));
  });
  createInterface({ input: child.stderr }).on('line', (line) => {
    console.error(rewrite(line));
  });
  const status = await new Promise<number>((resolve) => {
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
  if (status !== 0) {
    process.exit(status);
  }
}

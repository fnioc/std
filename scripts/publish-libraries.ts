// Topological publish helper for the @rhombus-std libraries.
//
// Lockstep versioning: every publishable library ships the SAME version number,
// bumped together from conventional commits by semantic-release. semantic-release
// resolves the shared version and this script fans it out over the packages --
// per-package `pnpm pkg set version` + `pnpm publish` -- in dependency order so a
// consumer is never published before the sibling it depends on.
//
// It reuses build-all.ts's discover/tier shape, but scopes discovery to the
// `libraries` group and keeps only the PUBLISHABLE packages: those carrying a
// `publishConfig` key and not marked `"private": true`.
//
// Two modes:
//   --list                        print publishable names, topological order, one per line
//   --version <semver> --tag <t>  set version + `pnpm publish --tag <t>` per package
//
// A failed publish exits non-zero immediately -- a partial lockstep release
// (some packages at the new version, some not) is worse than stopping.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Manifest {
  readonly name: string;
  readonly private?: boolean;
  readonly publishConfig?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface Package {
  readonly name: string;
  /** Absolute path to the package directory (for cwd of pnpm invocations). */
  readonly dir: string;
  /** Workspace-sibling package names this one depends on (any dependency kind). */
  readonly deps: readonly string[];
}

const ROOT = join(import.meta.dir, "..");
const GROUP = "libraries";

/** Yields the workspace-protocol dependency names across every dependency kind. */
function* workspaceDeps(manifest: Manifest): Generator<string> {
  const fields = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
  for (const field of fields) {
    for (const [name, spec] of Object.entries(field ?? {})) {
      if (String(spec).startsWith("workspace:")) {
        yield name;
      }
    }
  }
}

/** Reads every publishable library manifest into a name -> Package map. */
function discoverPackages(): Map<string, Package> {
  const packages = new Map<string, Package>();
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, GROUP));
  } catch {
    return packages;
  }
  for (const entry of entries) {
    const dir = join(ROOT, GROUP, entry);
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
    } catch {
      continue;
    }
    // Publishable = has publishConfig and is not private.
    if (!manifest.publishConfig || manifest.private) {
      continue;
    }
    packages.set(manifest.name, {
      name: manifest.name,
      dir,
      deps: [...new Set(workspaceDeps(manifest))],
    });
  }
  return packages;
}

/**
 * Peels the graph into dependency tiers (Kahn's algorithm): tier 0 depends on
 * nothing publishable, tier N depends only on tiers < N. Throws on a cycle.
 * A package's dependencies on non-publishable siblings don't gate its ordering.
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
      throw new Error(`publish-libraries: dependency cycle among ${[...pending.keys()].join(", ")}`);
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

/** Publishable packages flattened into a single topological (leaf-first) order. */
function topologicalOrder(): Package[] {
  const packages = discoverPackages();
  const tiers = computeTiers(packages);
  return tiers.flat().map((name) => packages.get(name)!);
}

function run(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const ordered = topologicalOrder();

if (process.argv.includes("--list")) {
  for (const pkg of ordered) {
    console.log(pkg.name);
  }
  process.exit(0);
}

const version = parseArg("--version");
const tag = parseArg("--tag");
if (!version || !tag) {
  console.error("usage: publish-libraries.ts --list | --version <semver> --tag <disttag>");
  process.exit(2);
}

for (const pkg of ordered) {
  console.log(`\n▶ publish ${pkg.name}@${version} (--tag ${tag})`);
  run("pnpm", ["pkg", "set", `version=${version}`], pkg.dir);
  run("pnpm", ["publish", "--tag", tag, "--provenance", "--no-git-checks"], pkg.dir);
}

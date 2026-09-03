// Derives every publishable library's `publishConfig` from its DEV `exports`,
// so the published surface is generated once here rather than hand-maintained in
// thirty-odd manifests.
//
//   publishConfig.exports = exports, with two transforms:
//     1. SCRUB     -- the white-box `./private/*` subpath is dropped, so a
//                     published consumer can't reach the seam even though src/
//                     may still ship in the tarball. pnpm honours
//                     publishConfig.exports, and omitting the key makes the
//                     subpath non-importable.
//     2. DIST-SWAP -- each surviving subpath swaps its in-repo `./src/*.ts`
//                     target for the `./dist/bundle/*.js` bundle, spelled as a
//                     bare string: the rolled `./dist/bundle/*.d.ts` sits beside
//                     it, and every resolver reading `exports` finds a target's
//                     sibling declarations on its own.
//                     A manifest whose `files` ships `src` gets a `source`
//                     condition naming the dev target ahead of the bundle -- the
//                     inline stage reads a marker's body out of the declaring
//                     package's own source, which a bundle cannot serve.
//                     A subpath declaring no runtime condition publishes as
//                     `types` alone.
//                     A string target OUTSIDE `./src/` (the `./ttsc` descriptor)
//                     passes through verbatim.
//
//   publishConfig.main is the same dist-swap of the top-level `main`. It serves
//   node10-style resolvers, which are also the only ones that read it; they strip
//   its `.js` and find the sibling `.d.ts` themselves.
//
//   Non-derived publishConfig fields (`access`, `provenance`) are preserved
//   verbatim -- they are publish policy, not derivable from `exports`.
//
// A package whose published surface is a deliberate semantic reshape rather than
// this mechanical swap is held hand-authored (NON_DERIVABLE below).
//
// Modes:
//   --check   exit non-zero listing packages whose publishConfig drifts from
//             the derived form (structural compare -- formatting-immune).
//   --write   rewrite publishConfig in place for any drifting package.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const LIBS = join(ROOT, 'libraries');

// Packages whose publishConfig is a deliberate semantic reshape of `exports`,
// not a mechanical dist-swap -- kept hand-authored, never rewritten here.
// Currently none.
const NON_DERIVABLE = new Set<string>([]);

interface Conditions {
  readonly [condition: string]: string;
}
type ExportEntry = string | Conditions;

interface Manifest {
  readonly name: string;
  readonly private?: boolean;
  readonly main?: string;
  readonly files?: readonly string[];
  readonly exports?: Record<string, ExportEntry>;
  readonly publishConfig?: Record<string, unknown>;
}

/** True for the white-box seam subpath dropped from the published surface. */
function isInternal(subpath: string): boolean {
  return subpath.startsWith('./private/');
}

/**
 * Swap a dev path to its published dist target -- the rolled artifacts live under
 * `./dist/bundle/` (the role-named sibling of the `./dist/stage/` lowering emit):
 *   kind 'js'  -> `./dist/bundle/<name>.js`   (runtime bundle)
 *   kind 'dts' -> `./dist/bundle/<name>.d.ts` (rolled declarations)
 * Idempotent: a value already under `./dist/bundle/` only has its extension
 * retargeted.
 */
function toDist(path: string, kind: 'js' | 'dts'): string {
  const inDist = path.replace(/^\.\/src\//, './dist/bundle/');
  const ext = kind === 'dts' ? '.d.ts' : '.js';
  return inDist.replace(/\.(d\.ts|ts|js)$/, ext);
}

/** True when the tarball ships `src`, so a `source` condition has a file to point at. */
function shipsSrc(manifest: Manifest): boolean {
  return manifest.files?.includes('src') ?? false;
}

/** The published entry for one surviving subpath (the dist-swap). */
function derivePublishedEntry(entry: ExportEntry, withSource: boolean): ExportEntry {
  if (typeof entry === 'string') {
    // A string target outside `./src/` -- the `./ttsc` descriptor -- is already
    // publish-shaped and ships as authored.
    if (!entry.startsWith('./src/')) {
      return entry;
    }
    return withSource ? { source: entry, default: toDist(entry, 'js') } : toDist(entry, 'js');
  }
  // A subpath declaring no runtime condition publishes as `types` alone: there is
  // nothing for `default` to resolve to, and a resolver reaching it for a value
  // import should find nothing. That is an augmentation anchor like di.core's
  // `./builders`, whose whole job is to stay resolvable to the declarations a
  // `declare module` merges into. Such a subpath is NOT scrubbed (see isInternal):
  // unresolvable, the augmentation silently detaches into a fresh ambient module.
  const runtime = entry.default ?? entry.import;
  if (runtime === undefined) {
    return { types: toDist(entry.types, 'dts') };
  }
  return derivePublishedEntry(runtime, withSource);
}

/** The derived `publishConfig.exports` for a whole manifest (scrub + dist-swap). */
function derivePublishExports(manifest: Manifest): Record<string, ExportEntry> {
  const withSource = shipsSrc(manifest);
  const out: Record<string, ExportEntry> = {};
  for (const [subpath, entry] of Object.entries(manifest.exports ?? {})) {
    if (isInternal(subpath)) {
      continue;
    }
    out[subpath] = derivePublishedEntry(entry, withSource);
  }
  return out;
}

/** The full derived publishConfig: preserves policy fields, replaces the derived ones. */
function derivePublishConfig(manifest: Manifest): Record<string, unknown> {
  const existing = manifest.publishConfig ?? {};
  const derived: Record<string, unknown> = { ...existing };
  // `exports` and `main` between them address every published file; a top-level
  // `types` would be a second spelling of declarations both already reach.
  delete derived.types;
  if (manifest.main !== undefined) {
    derived.main = toDist(manifest.main, 'js');
  }
  derived.exports = derivePublishExports(manifest);
  return derived;
}

interface Lib {
  readonly name: string;
  readonly file: string;
  readonly raw: string;
  readonly manifest: Manifest;
}

/** Every publishable library: a `publishConfig` and not marked private. */
function discover(): Lib[] {
  const libs: Lib[] = [];
  for (const dir of readdirSync(LIBS)) {
    const file = join(LIBS, dir, 'package.json');
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const manifest = JSON.parse(raw) as Manifest;
    if (manifest.private || manifest.publishConfig === undefined) {
      continue;
    }
    libs.push({ name: manifest.name, file, raw, manifest });
  }
  return libs.sort((a, b) => a.name.localeCompare(b.name));
}

/** Structural (formatting-immune) equality via canonical JSON. */
function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') {
    console.error('usage: derive-publish-config.ts --check | --write');
    process.exit(2);
  }

  const drifted: string[] = [];
  const written: string[] = [];

  for (const lib of discover()) {
    if (NON_DERIVABLE.has(lib.name)) {
      continue;
    }
    const derived = derivePublishConfig(lib.manifest);
    if (equal(derived, lib.manifest.publishConfig)) {
      continue;
    }
    drifted.push(lib.name);
    if (mode === '--write') {
      const next = { ...lib.manifest, publishConfig: derived };
      writeFileSync(lib.file, JSON.stringify(next, null, 2) + '\n');
      written.push(lib.name);
    }
  }

  if (mode === '--check') {
    if (drifted.length === 0) {
      console.log('publishConfig is in sync with exports for every publishable library.');
      return;
    }
    console.error('publishConfig drift (run `bun scripts/derive-publish-config.ts --write`):');
    for (const name of drifted) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  if (written.length === 0) {
    console.log('No drift -- nothing rewritten.');
    return;
  }
  console.log(`Rewrote publishConfig for ${written.length} package(s):`);
  for (const name of written) {
    console.log(`  - ${name}`);
  }
}

main();

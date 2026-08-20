// Derives every publishable library's `publishConfig` from its DEV `exports`,
// enforcing the §7 white-box scrub mechanically instead of by hand-editing each
// manifest (docs/decisions.md §7; §43's derived-not-authored spirit).
//
// The §7 derivation rule (confirmed against the hand-authored pairs):
//
//   publishConfig.exports = exports, with two transforms:
//     1. SCRUB   -- the white-box `./tokens/*` subpath is dropped, so a
//                   published consumer can't reach the seam even though src/
//                   still ships in the tarball (§7). This is the whole point:
//                   pnpm honours publishConfig.exports, and omitting the key
//                   makes it non-importable.
//     2. DIST-SWAP -- each surviving subpath swaps its in-repo `./src/*.ts`
//                   target for the published trio, in canonical order:
//                     types   <- the rolled `./dist/bundle/*.d.ts`
//                     import  <- the `./dist/bundle/*.js` bundle
//                     default <- the `./dist/bundle/*.js` bundle (or, for a
//                                types-only package, the `./dist/bundle/*.d.ts` --
//                                there is no JS)
//                   A string target OUTSIDE `./src/` (the `./ttsc` descriptor)
//                   passes through verbatim.
//
//   Top-level publishConfig.main/module/types are the same dist-swap of the
//   top-level fields, emitted only for the fields the package actually declares
//   (a types-only package has no `main`).
//
//   Non-derived publishConfig fields (`access`, `provenance`) are preserved
//   verbatim -- they are publish policy, not derivable from `exports`.
//
// Two packages are held hand-authored (NON_DERIVABLE below) because their
// published surface is a deliberate semantic reshape, not a mechanical swap.
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
  readonly module?: string;
  readonly types?: string;
  readonly exports?: Record<string, ExportEntry>;
  readonly publishConfig?: Record<string, unknown>;
  readonly rhombusBuild?: { readonly typesOnly?: boolean; };
}

/** True for the white-box seam subpath dropped from the published surface (§7). */
function isInternal(subpath: string): boolean {
  return subpath.startsWith('./tokens/');
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

/** A package with no `.js` anywhere in its `.` conditions ships declarations only. */
function isTypesOnly(manifest: Manifest): boolean {
  if (manifest.rhombusBuild?.typesOnly) {
    return true;
  }
  const dot = manifest.exports?.['.'];
  if (dot === undefined || typeof dot === 'string') {
    return false;
  }
  return !Object.values(dot).some((value) => value.endsWith('.js'));
}

/** The published conditions for one surviving subpath (the §7 dist-swap). */
function derivePublishedConditions(conditions: Conditions, typesOnly: boolean): Conditions {
  const typesSource = conditions.types ?? conditions.source ?? conditions.default;
  const out: Record<string, string> = {};
  out.types = toDist(typesSource, 'dts');
  if (conditions.import !== undefined) {
    out.import = toDist(conditions.import, 'js');
  }
  // An authoring-only package declares no runtime condition at all, so there is
  // nothing for `default` to resolve to and the subpath publishes as `types`
  // alone — a resolver that reaches it for a value import should find nothing.
  const defaultSource = conditions.default ?? conditions.import ?? conditions.bun;
  if (defaultSource !== undefined) {
    out.default = toDist(defaultSource, typesOnly ? 'dts' : 'js');
  }
  return out;
}

/** The derived `publishConfig.exports` for a whole manifest (scrub + dist-swap). */
function derivePublishExports(manifest: Manifest): Record<string, ExportEntry> {
  const typesOnly = isTypesOnly(manifest);
  const out: Record<string, ExportEntry> = {};
  for (const [subpath, entry] of Object.entries(manifest.exports ?? {})) {
    if (isInternal(subpath)) {
      continue;
    }
    if (typeof entry === 'string') {
      // An in-repo `./src/*.ts` target publishes as the dist trio; any other
      // string target (the `./ttsc` descriptor) is already publish-shaped.
      out[subpath] = entry.startsWith('./src/')
        ? derivePublishedConditions({ types: entry, import: entry, default: entry }, typesOnly)
        : entry;
      continue;
    }
    out[subpath] = derivePublishedConditions(entry, typesOnly);
  }
  return out;
}

/** The full derived publishConfig: preserves policy fields, replaces the derived ones. */
function derivePublishConfig(manifest: Manifest): Record<string, unknown> {
  const existing = manifest.publishConfig ?? {};
  const derived: Record<string, unknown> = { ...existing };
  if (manifest.main !== undefined) {
    derived.main = toDist(manifest.main, 'js');
  }
  if (manifest.module !== undefined) {
    derived.module = toDist(manifest.module, 'js');
  }
  if (manifest.types !== undefined) {
    derived.types = toDist(manifest.types, 'dts');
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

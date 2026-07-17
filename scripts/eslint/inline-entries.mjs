// @ts-check
// The JS twin of transforms/internal/inlinetransform/entries.go: loads a
// package.json's "rhombus.inline" publish list, composes any imported JSON files
// (recursively, file-relative, package-scoped, cycle-guarded), and validates
// every entry's shape. Kept byte-semantically identical to the Go loader so the
// authoring lint and the build stage agree on which entries exist and which are
// well-formed.

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * @typedef {{ type?: string, impl?: string, member?: string }} InlineEntry
 */

/** Infers an entry's kind, or returns null when it fits no certified shape. */
export function entryKind(/** @type {InlineEntry} */ e) {
  if (!e.type || !e.impl) {
    return null;
  }
  if (e.member) {
    return e.member === e.impl ? null : 'member';
  }
  const typeName = splitTypeToken(e.type);
  if (typeName === null || typeName !== e.impl) {
    return null;
  }
  return 'function';
}

/** Splits "<package>:<TypeName>" at the first colon, returning the TypeName. */
function splitTypeToken(/** @type {string} */ token) {
  const i = token.indexOf(':');
  if (i <= 0 || i === token.length - 1) {
    return null;
  }
  return token.slice(i + 1);
}

/**
 * Loads and composes the "rhombus.inline" entries declared by packageDir's
 * package.json. Throws on malformed JSON, a non-certified entry shape, an import
 * escaping the package, or an import cycle.
 * @returns {InlineEntry[]}
 */
export function loadInlineEntries(/** @type {string} */ packageDir) {
  const root = resolve(packageDir);
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const cfg = pkg['rhombus.inline'];
  if (!cfg) {
    return [];
  }
  return composeInline(cfg, root, new Set(), pkgPath);
}

/** @returns {InlineEntry[]} */
function composeInline(/** @type {any} */ cfg, /** @type {string} */ rootDir, /** @type {Set<string>} */ seen,
  /** @type {string} */ from)
{
  /** @type {InlineEntry[]} */
  const out = [];
  const entries = Array.isArray(cfg.entries) ? cfg.entries : [];
  for (let i = 0; i < entries.length; i++) {
    if (entryKind(entries[i]) === null) {
      throw new Error(`INLINE_ENTRY_SHAPE: ${from} entry ${i} is not a certified shape`);
    }
    out.push(entries[i]);
  }
  for (const rel of importPaths(cfg.import, from)) {
    const abs = resolve(dirname(from), rel);
    if (!withinRoot(rootDir, abs)) {
      throw new Error(`INLINE_ENTRY_IMPORT_ESCAPE: ${from} imports ${rel} outside ${rootDir}`);
    }
    if (seen.has(abs)) {
      throw new Error(`INLINE_ENTRY_IMPORT_CYCLE: import cycle reaching ${abs}`);
    }
    seen.add(abs);
    const nested = JSON.parse(readFileSync(abs, 'utf8'));
    out.push(...composeInline(nested, rootDir, seen, abs));
  }
  return out;
}

/** @returns {string[]} */
function importPaths(/** @type {unknown} */ raw, /** @type {string} */ from) {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw;
  }
  throw new Error(`INLINE_ENTRY_IMPORT: ${from} import must be a string or array of strings`);
}

function withinRoot(/** @type {string} */ root, /** @type {string} */ abs) {
  const rel = relative(root, abs);
  return rel !== '..' && !rel.startsWith(`..${'/'}`) && !rel.startsWith(`..\\`);
}

// @ts-check
// The JS twin of transforms/internal/inlinetransform/entries.go: resolves a
// package.json's "rhombus-std" config (following any "@imports" chain,
// deep-merging local keys over the imported base) and reads its "inline"
// object's "entries" publish list, validating every entry's shape. Kept
// byte-semantically identical to the Go loader so the authoring lint and the
// build stage agree on which entries exist and which are well-formed.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * @typedef {{ type?: string, impl?: string, member?: string }} InlineEntry
 * @typedef {'member' | 'floater' | 'static-member' | null} InlineKind
 * @typedef {'certified' | 'uncertified' | 'malformed'} InlineStatus
 */

/**
 * Classifies an entry by field KIND and presence into one of four rows and
 * returns its kind plus certification status. type names a TYPE (a
 * type-identifier reference — the interface an instance member is declared
 * on); impl names a VALUE (a fully-qualified "<package>:<Name>" export); member
 * is the member name, shared by both member shapes.
 *
 *   type + member + impl  → instance member, ambient   (certified)
 *   type + member         → instance member, own body  (uncertified)
 *   impl  + member         → static member              (uncertified)
 *   impl only              → floater                    (certified)
 *
 * type is present only paired with member (a lone type is malformed); every
 * other combination requires member alongside type or impl (a lone member, or
 * the empty entry, is malformed). A present type or impl must deserialize
 * through parseTypeRef — an absent package qualifier or any other malformed
 * reference is malformed, loudly. The JS twin of
 * transforms/internal/inlinetransform/entries.go's Kind() (and its TypeRef
 * parser); kept byte-semantically identical, minus the generic-argument layer
 * (tokentext.ParseToken) — no marker entry spells one today, so the JS twin
 * validates only the "<package>:<Name>" split every reference needs.
 * @returns {{ kind: InlineKind, status: InlineStatus }}
 */
export function entryKind(/** @type {InlineEntry} */ e) {
  const hasType = !!e.type;
  const hasImpl = !!e.impl;
  const hasMember = !!e.member;

  if (hasType && hasMember && hasImpl) {
    if (!parseTypeRef(e.type) || !parseTypeRef(e.impl)) {
      return { kind: null, status: 'malformed' };
    }
    return { kind: 'member', status: 'certified' };
  }
  if (hasType && hasMember && !hasImpl) {
    if (!parseTypeRef(e.type)) {
      return { kind: null, status: 'malformed' };
    }
    return { kind: 'member', status: 'uncertified' };
  }
  if (hasImpl && hasMember && !hasType) {
    if (!parseTypeRef(e.impl)) {
      return { kind: null, status: 'malformed' };
    }
    return { kind: 'static-member', status: 'uncertified' };
  }
  if (hasImpl && !hasMember && !hasType) {
    if (!parseTypeRef(e.impl)) {
      return { kind: null, status: 'malformed' };
    }
    return { kind: 'floater', status: 'certified' };
  }
  return { kind: null, status: 'malformed' };
}

/**
 * Deserializes a marker "<package>:<Name>" reference into { from, name }, or
 * null when it is not well-formed. The JS twin of
 * transforms/internal/inlinetransform/typeref.go's ParseTypeRef, minus the
 * generic-argument layer (see entryKind's doc comment).
 * @returns {{ from: string, name: string } | null}
 */
export function parseTypeRef(/** @type {string} */ token) {
  const i = token.indexOf(':');
  if (i <= 0 || i === token.length - 1) {
    return null;
  }
  return { from: token.slice(0, i), name: token.slice(i + 1) };
}

const IMPORTS_KEY = '@imports';

/**
 * Returns the fully-resolved "rhombus-std" config for packageDir's
 * package.json: local keys deep-merged (deepMerge) OVER the (recursively
 * resolved) "@imports" chain — a local key wins any leaf collision against
 * the imported base, an object recurses key-by-key, and an array
 * concatenates as imported-then-local with each element left atomic (an
 * inline entry never merges field-by-field with another).
 *
 * A package.json with no "rhombus-std" key at all resolves as though it read
 * exactly {"@imports": "./rhombus-std.json"} — the one default. A
 * "rhombus-std" key present with ANY value, including {}, is authoritative
 * on its own; the default file never participates once the key exists.
 *
 * Resolution is BLIND: an "@imports" path that isn't a readable file
 * contributes nothing, silently, whether the directive was defaulted or
 * explicitly written. A chain may be arbitrarily long; a cycle (a path
 * already in the chain) also contributes nothing rather than looping. A
 * present file with malformed JSON is still a hard error — blindness covers
 * absence, not corruption.
 *
 * This is the one entry point every rhombus-std config reader (the inline
 * publish list, and any future feature block) resolves through.
 *
 * This lint run has no incremental input-tracking seam: every file this and
 * resolveNode read, including a resolved rhombus-std.json, is re-read fresh
 * each time rather than registered against a cache key.
 * @returns {Record<string, unknown>}
 */
export function resolveConfig(/** @type {string} */ packageDir) {
  const root = resolve(packageDir);
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const raw = ('rhombus-std' in pkg) ? pkg['rhombus-std'] : { [IMPORTS_KEY]: './rhombus-std.json' };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`INLINE_ENTRY_SHAPE: ${pkgPath} "rhombus-std" must be an object`);
  }
  return resolveNode(raw, pkgPath, new Set([pkgPath]));
}

/**
 * Resolves node's "@imports" (if present) against fromFile's own directory
 * and deep-merges node's remaining keys (deepMerge) over the recursively
 * resolved imported base. visited is the set of absolute paths already in
 * this chain; a path already visited contributes nothing rather than being
 * re-read, so a cycle resolves clean instead of looping.
 * @returns {Record<string, unknown>}
 */
function resolveNode(/** @type {Record<string, unknown>} */ node, /** @type {string} */ fromFile,
  /** @type {Set<string>} */ visited) {
  const local = { ...node };
  const importPath = local[IMPORTS_KEY];
  delete local[IMPORTS_KEY];
  if (importPath === undefined) {
    return local;
  }
  if (typeof importPath !== 'string') {
    throw new Error(`INLINE_ENTRY_IMPORT: ${fromFile} ${JSON.stringify(IMPORTS_KEY)} must be a string`);
  }

  const abs = resolve(dirname(fromFile), importPath);
  if (visited.has(abs)) {
    return local;
  }
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    return local; // missing -> nothing, blind
  }
  let imported;
  try {
    imported = JSON.parse(text);
  } catch (err) {
    throw new Error(`INLINE_ENTRY_IMPORT: malformed ${abs}: ${err instanceof Error ? err.message : err}`);
  }
  if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
    throw new Error(`INLINE_ENTRY_IMPORT: ${abs} must resolve to an object`);
  }

  const base = resolveNode(imported, abs, new Set([...visited, abs]));
  return deepMerge(base, local);
}

/**
 * Merges local OVER base: an object recurses key-by-key (local wins a leaf
 * collision), an array concatenates as base-then-local, and any other value
 * — including a base/local type mismatch — replaces with local's. An array's
 * own elements are never merged into each other; they are concatenated as
 * opaque values.
 * @returns {Record<string, unknown>}
 */
function deepMerge(/** @type {Record<string, unknown>} */ base, /** @type {Record<string, unknown>} */ local) {
  const out = { ...base };
  for (const [k, lv] of Object.entries(local)) {
    if (!(k in out)) {
      out[k] = lv;
      continue;
    }
    const bv = out[k];
    if (Array.isArray(bv) && Array.isArray(lv)) {
      out[k] = [...bv, ...lv];
      continue;
    }
    if (isPlainObject(bv) && isPlainObject(lv)) {
      out[k] = deepMerge(bv, lv);
      continue;
    }
    out[k] = lv;
  }
  return out;
}

function isPlainObject(/** @type {unknown} */ v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Resolves packageDir's rhombus-std config (resolveConfig) and returns its
 * "inline" object's "entries" list, validated entry by entry, in resolved
 * order. A resolved config with no "inline" key returns [] — absence is not
 * an error.
 * @returns {InlineEntry[]}
 */
export function loadInlineEntries(/** @type {string} */ packageDir) {
  const root = resolve(packageDir);
  const pkgPath = join(root, 'package.json');
  const resolved = resolveConfig(root);
  return entriesFromResolved(resolved, root, pkgPath);
}

/**
 * Extracts and validates the "inline.entries" list from a resolved config.
 * from names the resolved config's origin, for diagnostics. Every entry's
 * impl (when present) must self-reference packageDir's own package — the
 * side-parser only ever reads files inside it, so an impl naming any other
 * package cannot resolve and is rejected here, loudly, at load time rather
 * than as a confusing not-found later.
 * @returns {InlineEntry[]}
 */
function entriesFromResolved(/** @type {Record<string, unknown>} */ resolved, /** @type {string} */ packageDir,
  /** @type {string} */ from) {
  const inlineVal = resolved.inline;
  if (inlineVal === undefined) {
    return [];
  }
  if (
    typeof inlineVal !== 'object' || inlineVal === null || Array.isArray(inlineVal)
    || !Array.isArray(/** @type {any} */ (inlineVal).entries)
  ) {
    throw new Error(`INLINE_ENTRY_SHAPE: ${from} "inline" must be an object with an "entries" array`);
  }
  const entries = /** @type {any} */ (inlineVal).entries;

  /** @type {InlineEntry[]} */
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const { status } = entryKind(e);
    if (status === 'malformed') {
      throw new Error(`INLINE_ENTRY_SHAPE: ${from} entry ${i} matches no grammar row`);
    }
    if (status === 'uncertified') {
      throw new Error(
        `INLINE_KIND_UNCERTIFIED: ${from} entry ${i} is a specced-but-not-yet-certified shape `
          + `(own-body instance members and static members are not certified)`,
      );
    }
    if (e.impl) {
      const implRef = parseTypeRef(e.impl);
      const declaringPkg = readPackageName(packageDir);
      if (implRef.from !== declaringPkg) {
        throw new Error(
          `INLINE_ENTRY_IMPL_FOREIGN: ${from} entry ${i} impl ${JSON.stringify(e.impl)} names package `
            + `${JSON.stringify(implRef.from)}, but must self-reference the declaring package `
            + `${JSON.stringify(declaringPkg)}`,
        );
      }
    }
    out.push(e);
  }
  return out;
}

/** Reads the "name" field of dir/package.json, or null. */
function readPackageName(/** @type {string} */ dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name ?? null;
  } catch {
    return null;
  }
}

// @ts-check
// The JS twin of transforms/internal/inlinetransform/entries.go: loads a
// package.json's "rhombus-std" marker "inline" publish list, composes any
// imported JSON files (recursively, file-relative, package-scoped,
// cycle-guarded), and validates every entry's shape. Kept byte-semantically
// identical to the Go loader so the authoring lint and the build stage agree on
// which entries exist and which are well-formed.

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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

/**
 * Loads and composes the "rhombus-std" marker's "inline" entries declared by
 * packageDir's package.json. Throws on malformed JSON, a non-certified entry
 * shape, an import escaping the package, or an import cycle.
 * @returns {InlineEntry[]}
 */
export function loadInlineEntries(/** @type {string} */ packageDir) {
  const root = resolve(packageDir);
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const cfg = pkg['rhombus-std'];
  if (!cfg) {
    return [];
  }
  return composeInline(cfg, root, new Set(), pkgPath);
}

/** Reads the "name" field of dir/package.json, or null. */
function readPackageName(/** @type {string} */ dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name ?? null;
  } catch {
    return null;
  }
}

/**
 * composeInline validates cfg's own entries and appends any imported files'
 * entries. from names the file cfg came from, for cycle diagnostics; rootDir is
 * the declaring package's own root, which every entry's impl (when present)
 * must self-reference — a foreign-package impl can never resolve through the
 * side-parser and is rejected here, loudly, at load time.
 * @returns {InlineEntry[]}
 */
function composeInline(/** @type {any} */ cfg, /** @type {string} */ rootDir, /** @type {Set<string>} */ seen,
  /** @type {string} */ from) {
  /** @type {InlineEntry[]} */
  const out = [];
  const entries = Array.isArray(cfg.inline) ? cfg.inline : [];
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
      const declaringPkg = readPackageName(rootDir);
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
  for (const rel of importPaths(cfg.import, from)) {
    const abs = resolve(dirname(from), rel);
    if (!withinRoot(rootDir, abs)) {
      throw new Error(`INLINE_ENTRY_IMPORT_ESCAPE: ${from} imports ${rel} outside ${rootDir}`);
    }
    if (seen.has(abs)) {
      throw new Error(`INLINE_ENTRY_IMPORT_CYCLE: import cycle reaching ${abs}`);
    }
    seen.add(abs);
    // Wrap read/parse failures as INLINE_ENTRY_IMPORT, matching the Go twin
    // (entries.go's loadImportFile) — a bare SyntaxError here would diverge from
    // the build's coded diagnostic.
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (err) {
      throw new Error(`INLINE_ENTRY_IMPORT: cannot read ${abs}: ${err instanceof Error ? err.message : err}`);
    }
    let nested;
    try {
      nested = JSON.parse(text);
    } catch (err) {
      throw new Error(`INLINE_ENTRY_IMPORT: malformed ${abs}: ${err instanceof Error ? err.message : err}`);
    }
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

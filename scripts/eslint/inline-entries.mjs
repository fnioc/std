// @ts-check
// The JS twin of transforms/internal/inlinetransform/entries.go: resolves a
// package.json's "rhombus-std" config (following any "extends" chain,
// deep-merging local keys over the extended base) and reads its "inline"
// object's "entries" publish list, validating every entry's shape. Kept
// byte-semantically identical to the Go loader so the authoring lint and the
// build stage agree on which entries exist and which are well-formed.

import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import * as TOML from 'smol-toml';

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

const EXTENDS_KEY = 'extends';

const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schema', 'rhombus-std.schema.json');

/** @type {import('ajv').ValidateFunction | undefined} */
let compiledConfigValidator;

/** Compiles schema/rhombus-std.schema.json once and caches the validator. */
function configValidator() {
  if (!compiledConfigValidator) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: true });
    compiledConfigValidator = ajv.compile(schema);
  }
  return compiledConfigValidator;
}

/**
 * Validates node — one resolved rhombus-std config node — against
 * schema/rhombus-std.schema.json, tagging a failure with source (the file,
 * package.json marker, or resolved-config label it came from) and the JSON
 * path ajv's own error list carries.
 */
function validateConfigNode(/** @type {unknown} */ node, /** @type {string} */ source) {
  const validate = configValidator();
  if (validate(node)) {
    return;
  }
  const detail = (validate.errors ?? [])
    .map((e) => `at ${JSON.stringify(e.instancePath || '/')}: ${e.message}`)
    .join('; ');
  throw new Error(`INLINE_CONFIG_SCHEMA: ${source} does not match the rhombus-std config schema: ${detail}`);
}

/**
 * Parses data (already-read file content) into the canonical JSON data model
 * (a plain object tree of string/number/boolean/null/array/object), picking a
 * parser by path's extension: .yaml/.yml is YAML, .toml is TOML, and
 * everything else — including .json and no extension — is JSON, the format
 * every rhombus-std config file used before "extends" could name a sibling in
 * another format. A present-but-unparseable file, an unresolvable YAML anchor
 * cycle, or a top level that isn't an object are all loud INLINE_ENTRY_IMPORT
 * errors. The JS twin of entries.go's parseConfigFile.
 * @returns {Record<string, unknown>}
 */
export function parseConfigFile(/** @type {string} */ path, /** @type {string} */ data) {
  let decoded;
  try {
    const ext = extname(path).toLowerCase();
    if (ext === '.yaml' || ext === '.yml') {
      decoded = parseYAML(data);
    } else if (ext === '.toml') {
      decoded = normalizeParsed(TOML.parse(data));
    } else {
      decoded = JSON.parse(data);
    }
  } catch (err) {
    throw new Error(`INLINE_ENTRY_IMPORT: malformed ${path}: ${err instanceof Error ? err.message : err}`);
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new Error(`INLINE_ENTRY_IMPORT: ${path} must resolve to an object`);
  }
  return /** @type {Record<string, unknown>} */ (decoded);
}

/**
 * Parses data as YAML, rejecting a self-referential anchor/alias cycle before
 * walking it any further, then normalizes the result (normalizeParsed) onto
 * the canonical JSON data model.
 */
function parseYAML(/** @type {string} */ data) {
  const decoded = yaml.load(data);
  checkYAMLCycle(decoded, new Set());
  return normalizeParsed(decoded);
}

/**
 * Walks value depth-first over the current ancestor path and fails the
 * moment a node is already on that path — js-yaml's own load() happily
 * builds a genuinely self-referential object graph for a cyclic anchor/alias
 * pair, so this runs before anything else touches the decoded value.
 */
function checkYAMLCycle(/** @type {unknown} */ value, /** @type {Set<object>} */ path) {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (path.has(value)) {
    throw new Error('anchor cycle');
  }
  path.add(value);
  try {
    for (const child of Object.values(value)) {
      checkYAMLCycle(child, path);
    }
  } finally {
    path.delete(value);
  }
}

/**
 * Recursively coerces a YAML- or TOML-decoded value onto the canonical JSON
 * data model. A YAML timestamp scalar (js-yaml resolves it to a native Date)
 * and a TOML temporal value (smol-toml's TomlDate, covering offset/local
 * datetime and local date/time) both render as RFC3339 — or the equivalent
 * ISO 8601 date/time-only text for a local, offset-less value — via their own
 * toISOString(), with a trailing zero fraction (".000") dropped to match the
 * Go loader's RFC3339Nano formatting exactly. Every other value is already
 * JSON-shaped (js-yaml and smol-toml both decode mappings/tables into plain
 * objects with string keys, and JSON.parse's own number type already matches
 * both parsers' plain-number output), so this is otherwise a structural
 * recursion only.
 * @returns {unknown}
 */
function normalizeParsed(/** @type {unknown} */ v) {
  if (Array.isArray(v)) {
    return v.map(normalizeParsed);
  }
  if (v instanceof TOML.TomlDate || v instanceof Date) {
    return v.toISOString().replace(/\.000(?=$|Z$|[+-]\d{2}:\d{2}$)/, '');
  }
  if (v !== null && typeof v === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, sub] of Object.entries(v)) {
      out[k] = normalizeParsed(sub);
    }
    return out;
  }
  return v;
}

/**
 * Returns the fully-resolved "rhombus-std" config for packageDir's
 * package.json: local keys deep-merged (deepMerge) OVER the (recursively
 * resolved) "extends" chain — a local key wins any leaf collision against
 * the extended base, an object recurses key-by-key, and an array
 * concatenates as base-then-local with each element left atomic (an inline
 * entry never merges field-by-field with another).
 *
 * A package.json with no "rhombus-std" key at all resolves as though it read
 * exactly
 *
 *   {"extends": ["./rhombus-std.toml", "./rhombus-std.yml", "./rhombus-std.yaml", "./rhombus-std.json"]}
 *
 * — the one default, each sibling tried in turn under the same blind
 * resolution and later-wins fold as any other "extends" array, so a missing
 * format contributes nothing and JSON, listed last, wins a conflict between
 * whichever siblings exist. A "rhombus-std" key present with ANY value,
 * including {}, is authoritative on its own; the default files never
 * participate once the key exists.
 *
 * Resolution is BLIND: an "extends" path that isn't a readable file
 * contributes nothing, silently, whether the directive was defaulted or
 * explicitly written. A chain may be arbitrarily long; a cycle (a path
 * already in the chain) also contributes nothing rather than looping. A
 * present file that fails to parse, or whose content doesn't match
 * schema/rhombus-std.schema.json, is still a hard error — blindness covers
 * absence, not corruption or an invalid shape.
 *
 * This is the one entry point every rhombus-std config reader (the inline
 * publish list, and any future feature block) resolves through.
 *
 * This lint run has no incremental input-tracking seam: every file this and
 * resolveNode read, including a resolved rhombus-std config, is re-read fresh
 * each time rather than registered against a cache key.
 * @returns {Record<string, unknown>}
 */
export function resolveConfig(/** @type {string} */ packageDir) {
  const root = resolve(packageDir);
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const raw = ('rhombus-std' in pkg)
    ? pkg['rhombus-std']
    : {
      [EXTENDS_KEY]: [
        './rhombus-std.toml',
        './rhombus-std.yml',
        './rhombus-std.yaml',
        './rhombus-std.json',
      ],
    };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`INLINE_ENTRY_SHAPE: ${pkgPath} "rhombus-std" must be an object`);
  }
  const resolved = resolveNode(raw, pkgPath, new Set([pkgPath]));
  validateConfigNode(resolved, `${pkgPath} (fully resolved)`);
  return resolved;
}

/**
 * Resolves node's "extends" (if present) against fromFile's own directory
 * and deep-merges node's remaining keys (deepMerge) over the recursively
 * resolved extended base. "extends" is a string or an array of strings; an
 * array applies LEFT TO RIGHT — each path's recursively resolved content
 * deep-merges over everything accumulated from the paths before it, so a
 * later path wins a leaf collision against an earlier one — and node's own
 * keys merge over that whole accumulated result last, winning every
 * collision against anything extended. visited is the set of absolute paths
 * already in the ANCESTOR chain reaching this node; a path already in it
 * contributes nothing rather than being re-read, so a cycle resolves clean
 * instead of looping. Two unrelated branches (e.g. two "extends" array
 * entries that happen to reach the same file by different routes) never
 * falsely collide: each path resolves from the ancestor set at THIS node,
 * never from a sibling's descendants.
 * @returns {Record<string, unknown>}
 */
function resolveNode(/** @type {Record<string, unknown>} */ node, /** @type {string} */ fromFile,
  /** @type {Set<string>} */ visited) {
  validateConfigNode(node, fromFile);
  const local = { ...node };
  const rawExtends = local[EXTENDS_KEY];
  delete local[EXTENDS_KEY];

  /** @type {string[]} */
  let paths;
  if (rawExtends === undefined) {
    return local;
  } else if (typeof rawExtends === 'string') {
    paths = [rawExtends];
  } else if (Array.isArray(rawExtends) && rawExtends.every((p) => typeof p === 'string')) {
    paths = rawExtends;
  } else {
    throw new Error(
      `INLINE_ENTRY_IMPORT: ${fromFile} ${JSON.stringify(EXTENDS_KEY)} must be a string or array of strings`,
    );
  }

  let accumulated = /** @type {Record<string, unknown>} */ ({});
  for (const p of paths) {
    const abs = resolve(dirname(fromFile), p);
    if (visited.has(abs)) {
      continue;
    }
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue; // missing -> nothing, blind
    }
    const extended = parseConfigFile(abs, text);

    const resolved = resolveNode(extended, abs, new Set([...visited, abs]));
    accumulated = deepMerge(accumulated, resolved);
  }
  return deepMerge(accumulated, local);
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

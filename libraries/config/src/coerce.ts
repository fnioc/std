// Coercion primitives + the schema walker.
//
// A schema is a `Type` tree: `Type.object({...})` at every level, a global
// `string` / `number` / `boolean` or a union of literal values at each leaf, and
// a union with `undefined` for a member the configuration may leave out.
// `build()` walks it against the configuration tree and produces the plain
// object it describes.
//
// `parseNumber`/`parseBoolean`/`parseBigInt` are the ONLY definitions of
// numeric/boolean/bigint coercion in the codebase. Both the on-demand section
// helpers (getNum/getBool, which THROW on the first bad value) and the walker
// (coerceBySchema, which AGGREGATES every problem before throwing) build on
// them, so the rules can never drift apart. The discriminated `ParseResult`
// lets each consumer pick its own failure mode.

import { exists, type IConfig } from '@rhombus-std/config.core';
import { type LiteralValue, type ObjectType, Type } from '@rhombus-std/primitives';

export type ParseResult<T> = { readonly ok: true; readonly value: T; } | { readonly ok: false;
  readonly reason: string; };

/**
 * Coerces `raw` to a finite number. Rejects blank explicitly (`Number("")` and
 * `Number("   ")` are both `0`), then requires `Number.isFinite` -- so
 * `"Infinity"`, `"-Infinity"`, and overflowing literals (`"1e400"` ->
 * `Infinity`) are rejected too.
 */
export function parseNumber(raw: string): ParseResult<number> {
  if (raw.trim() === '') {
    return { ok: false, reason: `not a number: ${JSON.stringify(raw)}` };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, reason: `not a finite number: ${JSON.stringify(raw)}` };
  }
  return { ok: true, value: n };
}

/**
 * Coerces `raw` to a boolean: liberal, case-insensitive, trimmed.
 *   true  <- "true" | "1" | "yes" | "on"
 *   false <- "false"| "0" | "no"  | "off"
 * Anything else fails.
 */
export function parseBoolean(raw: string): ParseResult<boolean> {
  const s = raw.trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') {
    return { ok: true, value: true };
  }
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') {
    return { ok: true, value: false };
  }
  return { ok: false, reason: `not a boolean: ${JSON.stringify(raw)}` };
}

/**
 * Coerces `raw` to a `bigint`. Rejects blank and anything `BigInt` itself would
 * reject (a decimal point, a leading/trailing non-digit) rather than letting
 * the constructor throw.
 */
export function parseBigInt(raw: string): ParseResult<bigint> {
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) {
    return { ok: false, reason: `not a bigint: ${JSON.stringify(raw)}` };
  }
  return { ok: true, value: BigInt(s) };
}

/**
 * The aggregating error thrown by `build()` when a schema is present and one or
 * more leaves are missing-required or invalid. Every problem across the whole
 * shape is collected before throwing -- a bad number three levels deep must not
 * hide a missing top-level key.
 */
export class SchemaCoercionError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(issues.join('; '));
    this.name = 'SchemaCoercionError';
    this.issues = issues;
  }
}

/** The leaf types a configuration value coerces into, each with its parser. */
const SCALARS = new Map<string, (raw: string) => ParseResult<unknown>>([
  ['string', (raw) => ({ ok: true, value: raw })],
  ['number', parseNumber],
  ['boolean', parseBoolean],
]);

/** One member of a schema: the type it names, and whether it may be absent. */
interface Slot {
  readonly type: Type;
  readonly optional: boolean;
}

function isUndefined(type: Type): boolean {
  return type.kind === 'literal' && type.value === undefined;
}

/**
 * Reads a member's slot. A member is optional exactly when its type unions with
 * `undefined`; what is left over after dropping it is the type a present value
 * must satisfy.
 */
function slotFor(member: Type): Slot {
  if (member.kind !== 'union') {
    return { type: member, optional: false };
  }
  const present = member.members.filter((alternative) => !isUndefined(alternative));
  if (present.length === member.members.length) {
    return { type: member, optional: false };
  }
  return { type: present.length === 1 ? present[0]! : Type.union(...present), optional: true };
}

/** The parser a leaf type names, or `undefined` when it names no coercible scalar leaf. */
function scalarFor(type: Type): ((raw: string) => ParseResult<unknown>) | undefined {
  if (type.kind !== 'global' || type.genericArgs.length > 0) {
    return undefined;
  }
  return SCALARS.get(type.name);
}

/**
 * Matches `raw` against a union of literal values: a string member by equality, a
 * number/boolean/bigint member by parsing then equality. The first matching member wins; a miss
 * names every allowed value.
 */
function matchLiteral(raw: string, members: readonly Type[]): ParseResult<LiteralValue> {
  for (const member of members) {
    if (member.kind !== 'literal') {
      continue;
    }
    const { value } = member;
    if (typeof value === 'string' && raw === value) {
      return { ok: true, value };
    }
    if (typeof value === 'boolean') {
      const parsed = parseBoolean(raw);
      if (parsed.ok && parsed.value === value) {
        return { ok: true, value };
      }
    }
    if (typeof value === 'number') {
      const parsed = parseNumber(raw);
      if (parsed.ok && parsed.value === value) {
        return { ok: true, value };
      }
    }
    if (typeof value === 'bigint') {
      const parsed = parseBigInt(raw);
      if (parsed.ok && parsed.value === value) {
        return { ok: true, value };
      }
    }
  }
  const allowed = members.map((member) => Type.stringify(member)).join(', ');
  return { ok: false, reason: `not one of ${allowed}` };
}

/** The parser a union type names when every member is a literal value, `undefined` otherwise. */
function literalUnionFor(type: Type): ((raw: string) => ParseResult<unknown>) | undefined {
  if (type.kind !== 'union' || !type.members.every((member) => member.kind === 'literal')) {
    return undefined;
  }
  const members = type.members;
  return (raw) => matchLiteral(raw, members);
}

/** The parser a leaf type names -- a scalar global or a literal union -- or `undefined` when it
 * names no coercible leaf. */
function leafFor(type: Type): ((raw: string) => ParseResult<unknown>) | undefined {
  return scalarFor(type) ?? literalUnionFor(type);
}

/** Is a value for this member present in the configuration at all? */
function present(node: IConfig, type: Type, key: string): boolean {
  return leafFor(type) !== undefined ? node.get(key) !== undefined : exists(node.getSection(key));
}

function walkRequired(node: IConfig, type: Type, key: string, path: readonly string[], issues: string[]): unknown {
  const fullPath = [...path, key].join(':');

  const leaf = leafFor(type);
  if (leaf !== undefined) {
    const raw = node.get(key);
    if (raw === undefined) {
      issues.push(`missing required key "${fullPath}"`);
      return undefined;
    }
    const parsed = leaf(raw);
    if (!parsed.ok) {
      issues.push(`invalid value for "${fullPath}": ${parsed.reason}`);
      return undefined;
    }
    return parsed.value;
  }

  if (type.kind === 'object') {
    const section = node.getSection(key);
    if (!exists(section)) {
      issues.push(`missing required key "${fullPath}"`);
      return {};
    }
    return walkObject(section, type, [...path, key], issues);
  }

  issues.push(
    `no configuration value coerces into ${Type.stringify(type)}, named by "${fullPath}" -- `
      + 'a schema names string, number, boolean, object and literal-union types',
  );
  return undefined;
}

function walkObject(node: IConfig, schema: ObjectType, path: readonly string[],
  issues: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(schema.members)) {
    const slot = slotFor(member);
    result[key] = slot.optional && !present(node, slot.type, key)
      ? undefined
      : walkRequired(node, slot.type, key, path, issues);
  }
  return result;
}

/**
 * Coerces `config` per `schema`, or throws {@link SchemaCoercionError} listing
 * every missing-required, invalid or uncoercible member. The returned shape
 * mirrors the schema exactly, so `build()`'s cast never lies: a member typed
 * `number` is always a real, finite `number`.
 */
export function coerceBySchema(config: IConfig, schema: ObjectType): unknown {
  const issues: string[] = [];
  const value = walkObject(config, schema, [], issues);
  if (issues.length > 0) {
    throw new SchemaCoercionError(issues);
  }
  return value;
}

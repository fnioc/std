// Coercion primitives + the schema-walker.
//
// `parseNumber`/`parseBoolean` are the ONLY definitions of numeric/boolean
// coercion in the codebase. Both the on-demand section helpers (getNum/getBool,
// which THROW on the first bad value) and the schema-walker (coerceBySchema,
// which AGGREGATES every problem before throwing) call them, so the rules can
// never drift apart. The discriminated `ParseResult` lets each consumer pick
// its own failure mode.

import type { IConfig } from '@rhombus-std/config.core';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { exists } from './ConfigExtensions';
import { OPTIONAL, type Schema } from './schema';

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T; }
  | { readonly ok: false; readonly reason: string; };

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

function isLeaf(s: Schema): s is 'string' | 'number' | 'boolean' {
  return s === 'string' || s === 'number' || s === 'boolean';
}

function isOptional(s: Schema): s is { readonly [OPTIONAL]: Schema; } {
  return typeof s === 'object' && s !== null && OPTIONAL in s;
}

function present(node: IConfig, inner: Schema, key: string): boolean {
  return isLeaf(inner) ? node.get(key) !== undefined : exists(node.getSection(key));
}

function walkRequired(
  node: IConfig,
  schema: Schema,
  key: string,
  path: readonly string[],
  issues: string[],
): unknown {
  const fullPath = [...path, key].join(':');

  if (isLeaf(schema)) {
    const raw = node.get(key);
    if (raw === undefined) {
      issues.push(`missing required key "${fullPath}"`);
      return undefined;
    }
    switch (schema) {
      case 'string':
        return raw;
      case 'number': {
        const r = parseNumber(raw);
        if (!r.ok) {
          issues.push(`invalid number for "${fullPath}": ${JSON.stringify(raw)}`);
          return undefined;
        }
        return r.value;
      }
      case 'boolean': {
        const r = parseBoolean(raw);
        if (!r.ok) {
          issues.push(`invalid boolean for "${fullPath}": ${JSON.stringify(raw)}`);
          return undefined;
        }
        return r.value;
      }
      default:
        return assertNever(schema);
    }
  }

  const section = node.getSection(key);
  if (!exists(section)) {
    issues.push(`missing required key "${fullPath}"`);
    return {};
  }
  return walkObject(section, schema as Record<PropertyKey, Schema>, [...path, key], issues);
}

function walkObject(
  node: IConfig,
  schema: Record<PropertyKey, Schema>,
  path: readonly string[],
  issues: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Only string keys are walked -- OPTIONAL is a symbol and only ever appears
  // INSIDE a wrapper, never as a sibling of the object's string keys.
  for (const key of Object.keys(schema)) {
    const sub = schema[key] as Schema;
    if (isOptional(sub)) {
      const inner = sub[OPTIONAL];
      result[key] = present(node, inner, key)
        ? walkRequired(node, inner, key, path, issues)
        : undefined;
    } else {
      result[key] = walkRequired(node, sub, key, path, issues);
    }
  }
  return result;
}

/**
 * Coerces `config` per `schema`, or throws {@link SchemaCoercionError} listing
 * every missing-required / invalid leaf. The returned shape mirrors `Infer<S>`
 * exactly, so `build()`'s cast to `Infer<S>` never lies: a field typed `number`
 * is always a real, finite `number`.
 */
export function coerceBySchema(config: IConfig, schema: Schema): unknown {
  const issues: string[] = [];
  const value = walkObject(config, schema as Record<PropertyKey, Schema>, [], issues);
  if (issues.length > 0) {
    throw new SchemaCoercionError(issues);
  }
  return value;
}

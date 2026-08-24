/**
 * The rules a type token is written and read by: which characters an identifier segment may carry
 * unescaped, how to spell one that cannot, and the unqualified names that carry a reading of their
 * own. The reserved set is derived from the tables below, so a name gains its reserved meaning and
 * its escaping in the same edit.
 */

import type { LiteralValue } from './Type.js';

/** Characters legal inside an unescaped segment. */
const SAFE = /[A-Za-z0-9_$@/.-]/;

/** A segment that needs no escaping at all: a safe body that opens with a letter-ish character. */
const PLAIN = /^[A-Za-z_$@][A-Za-z0-9_$@/.-]*$/;

/** The unqualified spellings that name a literal value rather than a type. */
export const KEYWORD_LITERALS: ReadonlyMap<string, LiteralValue> = new Map<string, LiteralValue>([
  ['Infinity', Infinity],
  ['NaN', NaN],
  ['false', false],
  ['null', null],
  ['true', true],
  ['undefined', undefined],
]);

/** The qualifier naming the ambient scope: the one source an import can never be written against. */
export const GLOBAL_QUALIFIER = 'global';

/**
 * Each aggregate spelling and the node kind it names. One type argument on a global name is that
 * aggregate wherever it is spelled — parsed, derived, or composed by hand — so the kind node is
 * the only identity the spelling ever has.
 */
export const LIST_KINDS = {
  Array: 'array',
  Iterable: 'iterable',
} as const;

/** An aggregate's wire spelling. */
export type ListName = keyof typeof LIST_KINDS;

export function isListName(name: string): name is ListName {
  return Object.hasOwn(LIST_KINDS, name);
}

/** The `from` a bare `ServiceProvider` resolves to. */
export const SERVICE_PROVIDER_FROM = '@rhombus-std/di.core';

/**
 * Names that mean something other than "a type called this" when they stand unqualified.
 *
 * @remarks
 * A name spelled like one of these is escaped so it reads back as a name; qualifying it
 * (`app:Func`) already disambiguates, so only an unqualified name consults this set.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...KEYWORD_LITERALS.keys(),
  ...Object.keys(LIST_KINDS),
  'Ctor',
  'Func',
  'ServiceProvider',
  'new',
]);

export function isSafeChar(char: string): boolean {
  return SAFE.test(char);
}

export function isSegmentStart(char: string): boolean {
  return char === '\\' || /[A-Za-z_$@]/.test(char);
}

/**
 * Spells `text` as one identifier segment.
 *
 * @remarks
 * A segment that is already unambiguous is returned untouched, so ordinary names and package
 * qualifiers stay exactly as written. Anything else opens with a `\` marker — which alone makes
 * the segment a name rather than a keyword or a number — and escapes each unsafe character.
 *
 * @param reserved - whether {@link RESERVED_NAMES} carry their reserved meaning in this position.
 */
export function escapeSegment(text: string, reserved = false): string {
  if (PLAIN.test(text) && !(reserved && RESERVED_NAMES.has(text))) {
    return text;
  }
  let escaped = '\\';
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    escaped += SAFE.test(char) ? char : `\\${char}`;
  }
  return escaped;
}

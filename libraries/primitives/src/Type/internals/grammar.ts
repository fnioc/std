/**
 * The lexical rules shared by the type-token writer and reader: which characters an
 * identifier segment may carry unescaped, and how to spell one that cannot.
 */

/** Characters legal inside an unescaped segment. */
const SAFE = /[A-Za-z0-9_$@/.-]/;

/** A segment that needs no escaping at all: a safe body that opens with a letter-ish character. */
const PLAIN = /^[A-Za-z_$@][A-Za-z0-9_$@/.-]*$/;

/**
 * Names that mean something other than "a type called this" when they stand unqualified.
 *
 * @remarks
 * A name spelled like one of these is escaped so it reads back as a name; qualifying it
 * (`app:Func`) already disambiguates, so only the global namespace consults this set.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'new',
  'Func',
  'Ctor',
  'ServiceProvider',
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

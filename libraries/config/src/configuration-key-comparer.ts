// compareConfigurationKeys -- segment-by-segment, numeric-aware ordering for
// configuration keys.
//
// Keys are walked one ':'-delimited segment at a time. Delimiter RUNS collapse:
// leading, trailing, and doubled delimiters produce no empty segments, so
// "a::b", ":a:b", and "a:b:" all compare equal to "a:b". Per segment:
//   - both segments parse as integers -> compare numerically (so array
//     indices sort 0,1,2,...,9,10 instead of lexicographically 0,1,10,2,...),
//   - neither parses -> compare ordinal-case-insensitive,
//   - exactly one parses -> the numeric one sorts first.
// If every shared segment ties, the key that runs out of segments first (the
// shorter, once runs are collapsed) sorts first. This mirrors MEC's
// ConfigurationKeyComparer.Compare / SkipAheadOnDelimiter span-walk rather than
// a naive split(':'), which would order delimiter-run keys differently.

import { KeyDelimiter } from './abstractions/configuration-path';
import { foldKey } from './fold-key';

/**
 * Parses a base-10 integer, accepting optional surrounding whitespace and an
 * optional leading sign. Returns `undefined` for anything else, including
 * values outside the safe-integer range -- config array indices never
 * approach this.
 */
function tryParseInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Ordinal, case-insensitive string comparison returning -1/0/1. */
function compareOrdinalIgnoreCase(x: string, y: string): number {
  const xf = foldKey(x);
  const yf = foldKey(y);
  if (xf < yf) {
    return -1;
  }
  if (xf > yf) {
    return 1;
  }
  return 0;
}

/** Advances past any run of consecutive delimiters starting at `i`. */
function skipDelimiters(key: string, i: number): number {
  while (i < key.length && key[i] === KeyDelimiter) {
    i++;
  }
  return i;
}

/** The index of the next delimiter at or after `i`, or `key.length` if none. */
function nextDelimiter(key: string, i: number): number {
  const found = key.indexOf(KeyDelimiter, i);
  return found === -1 ? key.length : found;
}

/** Compares one already-extracted segment pair per the numeric-aware rules. */
function compareSegments(xSegment: string, ySegment: string): number {
  const xValue = tryParseInt(xSegment);
  const yValue = tryParseInt(ySegment);

  if (xValue === undefined && yValue === undefined) {
    return compareOrdinalIgnoreCase(xSegment, ySegment);
  }
  if (xValue !== undefined && yValue !== undefined) {
    return xValue - yValue;
  }
  // Exactly one is numeric -- the numeric segment sorts first.
  return xValue !== undefined ? -1 : 1;
}

/** Compares two configuration keys segment-by-segment; suitable as an `Array.prototype.sort` comparator. */
export function compareConfigurationKeys(x: string, y: string): number {
  // Walk both keys segment by segment, collapsing delimiter runs (leading,
  // trailing, and doubled) exactly as MEC's SkipAheadOnDelimiter does.
  let xi = skipDelimiters(x, 0);
  let yi = skipDelimiters(y, 0);

  while (xi < x.length && yi < y.length) {
    const xEnd = nextDelimiter(x, xi);
    const yEnd = nextDelimiter(y, yi);

    const result = compareSegments(x.slice(xi, xEnd), y.slice(yi, yEnd));
    if (result !== 0) {
      return result;
    }

    xi = skipDelimiters(x, xEnd);
    yi = skipDelimiters(y, yEnd);
  }

  // Every shared segment tied -- whichever key ran out of segments first (the
  // shorter, once runs are collapsed) sorts before the one with more to go.
  if (xi >= x.length) {
    return yi >= y.length ? 0 : -1;
  }
  return 1;
}

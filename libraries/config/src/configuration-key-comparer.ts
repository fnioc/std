// compareConfigurationKeys -- segment-by-segment, numeric-aware ordering for
// configuration keys.
//
// Keys are split on the ':' delimiter and compared one segment at a time:
//   - both segments parse as integers -> compare numerically (so array
//     indices sort 0,1,2,...,9,10 instead of lexicographically 0,1,10,2,...),
//   - neither parses -> compare ordinal-case-insensitive,
//   - exactly one parses -> the numeric one sorts first.
// If every shared segment ties, the shorter (prefix) key sorts first.

import { KeyDelimiter } from "./abstractions/configuration-path";
import { foldKey } from "./fold-key";

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

/** Compares two configuration keys segment-by-segment; suitable as an `Array.prototype.sort` comparator. */
export function compareConfigurationKeys(x: string, y: string): number {
  const xParts = x.split(KeyDelimiter);
  const yParts = y.split(KeyDelimiter);

  const shared = Math.min(xParts.length, yParts.length);
  for (let i = 0; i < shared; i++) {
    const xSegment = xParts[i]!;
    const ySegment = yParts[i]!;

    const xValue = tryParseInt(xSegment);
    const yValue = tryParseInt(ySegment);

    let result: number;
    if (xValue === undefined && yValue === undefined) {
      result = compareOrdinalIgnoreCase(xSegment, ySegment);
    } else if (xValue !== undefined && yValue !== undefined) {
      result = xValue - yValue;
    } else {
      // Exactly one is numeric -- the numeric segment sorts first.
      result = xValue !== undefined ? -1 : 1;
    }

    if (result !== 0) {
      return result;
    }
  }

  // Every shared segment tied -- the shorter (prefix) key sorts first.
  return xParts.length - yParts.length;
}

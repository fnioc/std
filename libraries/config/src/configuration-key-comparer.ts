// ConfigurationKeyComparer -- segment-by-segment, numeric-aware ordering for
// configuration keys.
//
// Keys are split on the ':' delimiter and compared one segment at a time:
//   - both segments parse as integers -> compare numerically (so array
//     indices sort 0,1,2,...,9,10 instead of lexicographically 0,1,10,2,...),
//   - neither parses -> compare ordinal-case-insensitive,
//   - exactly one parses -> the numeric one sorts first.
// If every shared segment ties, the shorter (prefix) key sorts first.

import { KeyDelimiter } from "./abstractions/configuration-path";

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
  const xu = x.toUpperCase();
  const yu = y.toUpperCase();
  if (xu < yu) {
    return -1;
  }
  if (xu > yu) {
    return 1;
  }
  return 0;
}

/**
 * The configuration key comparer. Exposed as a static `compare` function
 * suitable for passing directly to `Array.prototype.sort`.
 */
export class ConfigurationKeyComparer {
  private constructor() {}

  /** Compares two configuration keys segment-by-segment. */
  public static readonly compare = (x: string, y: string): number => {
    const xParts = x.split(KeyDelimiter);
    const yParts = y.split(KeyDelimiter);

    const shared = Math.min(xParts.length, yParts.length);
    for (let i = 0; i < shared; i++) {
      const xSegment = xParts[i] as string;
      const ySegment = yParts[i] as string;

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
  };
}

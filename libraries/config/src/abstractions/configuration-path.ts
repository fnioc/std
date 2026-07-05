// A string is itself iterable (char by char), so a naive `Symbol.iterator in
// value` check would treat `combine("Host")` as an iterable of characters and
// recurse into `combine("H", "o", "s", "t")` -> "H:o:s:t" (and infinite-loops
// on a 1-char string). Excluding strings (and null/undefined) keeps the
// single-string overload returning the string verbatim.
function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

// Utility functions and constants for manipulating configuration paths.

/** The delimiter ":" used to separate individual keys in a path. */
export const KeyDelimiter = ":";

/** Combines path segments into one colon-delimited path. */
export function combine(...pathSegments: string[]): string;
export function combine(pathSegments: Iterable<string>): string;
export function combine(...args: [pathSegments: Iterable<string>] | [...pathSegments: string[]]) {
  if (args.length === 1 && isIterable(args[0])) {
    return combine(...Array.from(args[0]));
  }
  return Array.from(args).join(KeyDelimiter);
}

/** Extracts the last path segment from `path`. */
export function getSectionKey(path?: string) {
  if (!path?.trim()) {
    return path;
  }

  const lastDelimiterIndex = path.lastIndexOf(":");
  return lastDelimiterIndex < 0 ? path : path.substring(lastDelimiterIndex + 1);
}

/**
 * Extracts the parent path for `path` -- the original minus its last segment,
 * or `null` if `path` is already a top-level node.
 */
export function getParentPath(path?: string) {
  if (!path?.trim()) {
    return null;
  }

  const lastDelimiterIndex = path.lastIndexOf(":");
  return lastDelimiterIndex < 0 ? null : path.substring(0, lastDelimiterIndex);
}

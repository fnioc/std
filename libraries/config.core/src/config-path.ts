// A string is itself iterable (char by char), so excluding it (and
// null/undefined) here keeps combine("Host") returning "Host" instead of
// recursing per character -- which would infinite-loop on a single-char string.
function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

/** The delimiter ":" used to separate individual keys in a path. */
export const KeyDelimiter = ':';

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
export function getSectionKey(path: string): string {
  if (!path.trim()) {
    return path;
  }

  const lastDelimiterIndex = path.lastIndexOf(':');
  return lastDelimiterIndex < 0 ? path : path.substring(lastDelimiterIndex + 1);
}

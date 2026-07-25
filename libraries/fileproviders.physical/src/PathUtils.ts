// On POSIX the only character invalid in a path segment is the NUL byte
// (`/` is the separator and is allowed in a full path), so the invalid-char
// checks below test for NUL only. `hasInvalidFilterChars` would additionally
// permit glob characters (`*`, `?`, `|`) once wildcard watching exists (see
// PhysicalFilesWatcher); today both reduce to the same NUL check.

import { sep } from 'node:path';

const PATH_SEPARATORS = /[\\/]/;

/**
 * Returns `true` if `path` contains a character that is invalid in a file
 * path. On POSIX this is the NUL byte.
 */
export function hasInvalidPathChars(path: string): boolean {
  return path.includes('\0');
}

/**
 * Returns `true` if `filter` contains a character that is invalid in a watch
 * filter. On POSIX this is the NUL byte (glob characters are permitted).
 */
export function hasInvalidFilterChars(filter: string): boolean {
  return filter.includes('\0');
}

/**
 * Appends the platform directory separator to `path` unless it already ends in
 * a separator (or is empty).
 */
export function ensureTrailingSeparator(path: string): string {
  if (path.length > 0 && path[path.length - 1] !== '/' && path[path.length - 1] !== '\\') {
    return path + sep;
  }
  return path;
}

/**
 * Removes any leading directory separators from `path` -- leading slashes on
 * a relative subpath are tolerated.
 */
export function trimStartSeparators(path: string): string {
  let start = 0;
  while (start < path.length && (path[start] === '/' || path[start] === '\\')) {
    start++;
  }
  return path.slice(start);
}

/**
 * Returns `true` if walking `path` segment-by-segment ever rises above its
 * starting directory (a leading `..` that escapes the root).
 */
export function pathNavigatesAboveRoot(path: string): boolean {
  let depth = 0;
  for (const segment of path.split(PATH_SEPARATORS)) {
    if (segment === '.' || segment === '') {
      continue;
    } else if (segment === '..') {
      depth--;
      if (depth === -1) {
        return true;
      }
    } else {
      depth++;
    }
  }
  return false;
}

/**
 * Returns `true` if `path` ends in a directory separator -- used to route a
 * directory-prefix watch.
 */
export function isDirectoryPath(path: string): boolean {
  return path.length > 0 && (path[path.length - 1] === '/' || path[path.length - 1] === '\\');
}

// PathUtils -- ported from
// ME.FileProviders.Physical.Internal.PathUtils.
//
// DEVIATION (flagged): the reference derives its invalid-character sets from
// `Path.GetInvalidFileNameChars()`, which is platform-specific and Windows-
// heavy. On POSIX the only character that is truly invalid in a path segment
// is the NUL byte (`/` is the separator and is allowed in a full path), so the
// invalid-char checks here test for NUL. `hasInvalidFilterChars` differs from
// `hasInvalidPathChars` only in that glob characters (`*`, `?`, `|`) would be
// permitted -- but since this port defers wildcard watching (see
// PhysicalFilesWatcher), both currently reduce to the same NUL check.

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
 * Removes any leading directory separators from `path`. Mirrors the reference's
 * `TrimStart(PathSeparators)` -- leading slashes on a relative subpath are
 * tolerated.
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
 * starting directory (a leading `..` that escapes the root). Mirrors the
 * reference's depth-counting `PathNavigatesAboveRoot`.
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
 * Returns `true` if `path` ends in a directory separator -- the reference's
 * `IsDirectoryPath`, used to route a directory-prefix watch.
 */
export function isDirectoryPath(path: string): boolean {
  return path.length > 0 && (path[path.length - 1] === '/' || path[path.length - 1] === '\\');
}

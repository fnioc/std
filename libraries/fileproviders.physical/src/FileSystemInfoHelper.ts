// FileSystemInfoHelper -- ported from
// ME.FileProviders.Physical.FileSystemInfoHelper.
//
// DEVIATION (flagged): the reference also tests the `Hidden`/`System` file
// attributes, but those have no POSIX analog (see ExclusionFilters). On the
// repo's target platform only the dot-prefix check is enforceable, so this
// helper takes only the entry name -- the attribute branches collapse to a
// documented no-op. When a platform that exposes those attributes is targeted,
// widen this helper to accept the attribute bits.

import { ExclusionFilters } from './ExclusionFilters.js';

/**
 * Returns `true` if an entry named `name` should be excluded under `filters`.
 *
 * @param name The entry name (not including any path).
 * @param filters The active exclusion filters.
 */
export function isExcluded(name: string, filters: ExclusionFilters): boolean {
  if (filters === ExclusionFilters.None) {
    return false;
  }
  if (name.startsWith('.') && (filters & ExclusionFilters.DotPrefixed) !== 0) {
    return true;
  }
  // Hidden/System attributes have no POSIX analog -- a documented no-op here.
  return false;
}

// Only the dot-prefix filter is enforceable on POSIX; the `Hidden`/`System`
// bits are accepted but always no-op (see ExclusionFilters).

import { ExclusionFilters } from './ExclusionFilters.js';

/**
 * Returns `true` if an entry named `name` should be excluded under `filters`.
 *
 * @param name The entry name (not including any path).
 */
export function isExcluded(name: string, filters: ExclusionFilters): boolean {
  if (filters === ExclusionFilters.None) {
    return false;
  }
  if (name.startsWith('.') && (filters & ExclusionFilters.DotPrefixed) !== 0) {
    return true;
  }
  return false;
}

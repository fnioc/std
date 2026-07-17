// Shared test helper. `rootOf` replaces the pre-rewrite
// `new ConfigRoot(new Map(...))` construction pattern: it builds a real
// provider-list-backed root over a single Memory provider, exercising the
// production ConfigBuilder -> MemoryConfigSource ->
// ConfigRoot path rather than hand-constructing an internal map.

import { ConfigBuilder, type ConfigData, type IConfigRoot } from '@rhombus-std/config';

/**
 * Builds a ConfigRoot from in-memory `entries` (a Record or `[k,v]`
 * iterable). Tier-0 `build()` types its result as `IndexedSection`; tests that
 * need the root surface (reload/providers) take it as `IConfigRoot`.
 */
export function rootOf(entries: ConfigData): IConfigRoot {
  return new ConfigBuilder().addInMemoryCollection(entries).build() as unknown as IConfigRoot;
}

// Shared test helper. `rootOf` replaces the pre-rewrite
// `new ConfigurationRoot(new Map(...))` construction pattern: it builds a real
// provider-list-backed root over a single Memory provider, exercising the
// production ConfigurationBuilder -> MemoryConfigurationSource ->
// ConfigurationRoot path rather than hand-constructing an internal map.

import { ConfigurationBuilder, type ConfigurationData } from "@rhombus-std/config";
import type { IConfigurationRoot } from "@rhombus-std/config";

/**
 * Builds a ConfigurationRoot from in-memory `entries` (a Record or `[k,v]`
 * iterable). Tier-0 `build()` types its result as `IndexedSection`; tests that
 * need the root surface (reload/providers) take it as `IConfigurationRoot`.
 */
export function rootOf(entries: ConfigurationData): IConfigurationRoot {
  return new ConfigurationBuilder().addInMemoryCollection(entries).build() as unknown as IConfigurationRoot;
}

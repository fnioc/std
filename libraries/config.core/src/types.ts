// The TS-only helper types with no per-file dotnet/ME equivalent: the plain
// object codomain of `toObject()`, the index-navigable section shape, and the
// try-get tuple that replaces ME's `bool TryGet(out string?)` out-param
// pattern. Grouped here (rather than split further) because none of these has
// its own ME source file to mirror -- see docs/decisions.md's split-oracle note.

import type { IConfigurationSection } from "./configuration-section";

/**
 * A node's subtree as a nested plain string object. A node that has children
 * is a nested record (its own scalar value, if any, is dropped -- see
 * {@link IConfiguration.toObject}); a pure leaf is its string value.
 */
export type ConfigObject = { readonly [key: string]: string | ConfigObject };

/**
 * The index-navigable Section type: an {@link IConfigurationSection} whose
 * unknown string keys resolve to further sections, so `config.Server.Port`
 * dot/bracket navigation type-checks.
 *
 * INLINE self-referential intersection by design -- routing the recursive
 * self-reference through a generic alias trips TS2456 ("Type alias circularly
 * references itself"). Real members (`value`, `get`, `getSection`, ...) win
 * over the index signature; only genuinely-unknown keys resolve to
 * `IndexedSection`. Under `noUncheckedIndexedAccess` the index-access site
 * (`config.Server`) types as `IndexedSection | undefined` -- a conservative
 * false-positive for navigation (runtime always returns a Section for a string
 * key), by design. The typed path without that tax is a runtime schema
 * (`ConfigurationBuilder.withSchema`), whose result has named keys and no
 * index signature.
 */
export type IndexedSection = IConfigurationSection & {
  readonly [key: string]: IndexedSection;
};

/**
 * The result of a try-get lookup: `[false]` on a miss, `[true, value]` on a
 * hit. Replaces ME's `bool TryGet(out string?)` out-param pattern, which has
 * no direct TS equivalent.
 */
export type ITryGetResult<T> = [success: false] | [success: true, value: T];

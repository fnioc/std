import type { IConfigSection } from './IConfigSection';

/**
 * A node's subtree as a nested plain string object. A node that has children
 * is a nested record (its own scalar value, if any, is dropped -- see
 * {@link IConfig.toObject}); a pure leaf is its string value.
 */
export type ConfigObject = { readonly [key: string]: string | ConfigObject; };

/**
 * The index-navigable Section type: an {@link IConfigSection} whose
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
 * (`ConfigBuilder.withSchema`), whose result has named keys and no
 * index signature.
 */
export type IndexedSection = IConfigSection & { readonly [key: string]: IndexedSection; };

/**
 * The result of a try-get lookup: `[false]` on a miss, `[true, value]` on a
 * hit.
 */
export type ITryGetResult<T> = [success: false] | [success: true, value: T];

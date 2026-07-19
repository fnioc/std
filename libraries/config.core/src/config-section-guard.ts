// Runtime discriminant distinguishing a genuine section from a root.
//
// The reference's `asEnumerable` walk tests `config is IConfigurationSection`
// -- a cheap interface test in C#. TypeScript erases interfaces, so there is no
// `x is IConfigSection` at runtime to test against; and structural duck-typing
// does not work here, because the port's `ConfigRoot` exposes `key`, `path`,
// and `value` as members yet is deliberately NOT an `IConfigSection`. So a
// `"path" in config` probe cannot tell a root from a section.
//
// Instead the concrete section stamps itself with a unique-symbol brand, and
// this guard reads that brand. The brand lives in config.core (the abstractions
// package) so both the concrete section (in @rhombus-std/config, which applies
// it) and every consumer that needs the section-vs-root distinction resolve the
// SAME symbol -- the augmentation-identity invariant (docs/decisions.md §38):
// config keeps config.core external, so the symbol is a shared singleton, never
// a forked private copy. `ConfigRoot`/`ConfigManager` do not apply the brand,
// so the guard returns `false` for them.

import type { IConfigSection } from './IConfigSection';

/**
 * The brand a concrete {@link IConfigSection} sets on itself (as a public
 * symbol-keyed own property valued `true`) so {@link isConfigSection} can
 * recognize it at runtime. A root never carries this brand.
 */
export const configSectionBrand: unique symbol = Symbol('@rhombus-std/config.core#IConfigSection');

/**
 * Whether `config` is a genuine {@link IConfigSection} rather than a root.
 * Reads the {@link configSectionBrand} the concrete section stamps on itself --
 * the runtime analog of the reference's `config is IConfigurationSection`
 * interface test.
 */
export function isConfigSection(config: unknown): config is IConfigSection {
  return typeof config === 'object'
    && config !== null
    && (config as Record<PropertyKey, unknown>)[configSectionBrand] === true;
}

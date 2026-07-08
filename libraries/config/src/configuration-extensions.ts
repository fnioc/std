// The public MECA convenience helpers over IConfiguration -- port of
// `ConfigurationExtensions.cs`. These are runtime functions, so they live in
// @rhombus-std/config (not config.core, which ships zero runtime values -- see
// docs/decisions.md). Presented as free functions rather than extension
// methods, mirroring the existing `compareConfigurationKeys` shape.
//
// The generic `Add<TSource>(configureSource)` factory-add from the same .NET
// file is intentionally not ported (candidate intentional deviation -- no
// consumer, and the `new TSource()` pattern has no faithful TS analog).

import type { IConfiguration, IConfigurationSection } from "@rhombus-std/config.core";
import { ConfigurationSection } from "./configuration-section";

/**
 * The specified connection string from `configuration`. Shorthand for
 * `configuration.getSection("ConnectionStrings").get(name)`.
 */
export function getConnectionString(configuration: IConfiguration, name: string): string | undefined {
  return configuration.getSection("ConnectionStrings").get(name);
}

/**
 * Whether `section` has a {@link IConfigurationSection.value} or at least one
 * child. Returns `false` for a nullish section. The child probe stops at the
 * first result rather than materializing the whole child list.
 */
export function exists(section: IConfigurationSection | undefined): boolean {
  if (!section) {
    return false;
  }
  if (section.value !== undefined) {
    return true;
  }
  for (const _child of section.getChildren()) {
    return true;
  }
  return false;
}

/**
 * The configuration subsection with the specified `key`. Unlike
 * {@link IConfiguration.getSection} -- which always returns a (possibly empty)
 * section -- this throws when no matching section {@link exists}.
 */
export function getRequiredSection(configuration: IConfiguration, key: string): IConfigurationSection {
  const section = configuration.getSection(key);
  if (exists(section)) {
    return section;
  }
  throw new Error(`There is no configuration section with key "${key}".`);
}

/**
 * Enumerates the key/value pairs within `configuration` as a depth-first walk
 * of the section tree. When `makePathsRelative` is `true`, the enumeration
 * root's path is trimmed from the front of each returned key (and the root's
 * own -- now empty -- key is skipped).
 *
 * Mirrors MECA's stack-based DFS. The section-vs-root distinction is load
 * bearing: the port's {@link ConfigurationRoot} exposes an empty `path` yet is
 * NOT an {@link IConfigurationSection}, so the enumeration root is only yielded
 * (and only contributes a relative prefix) when it is a genuine section --
 * tested via `instanceof`, never duck-typed on `path`. Every node reached
 * through `getChildren()` is a section by the interface contract.
 */
export function* asEnumerable(
  configuration: IConfiguration,
  makePathsRelative = false,
): Generator<[key: string, value: string | undefined]> {
  const rootIsSection = configuration instanceof ConfigurationSection;
  // Trim the root section's path plus its trailing delimiter; a non-section
  // root contributes no prefix.
  const prefixLength = makePathsRelative && rootIsSection ? configuration.path.length + 1 : 0;

  const stack: IConfiguration[] = [configuration];
  while (stack.length) {
    const node = stack.pop()!;
    const isSection = node === configuration ? rootIsSection : true;
    // Skip the enumeration root itself when trimming paths -- its relative key
    // would be empty.
    if (isSection && (!makePathsRelative || node !== configuration)) {
      const section = node as IConfigurationSection;
      yield [section.path.substring(prefixLength), section.value];
    }
    for (const child of node.getChildren()) {
      stack.push(child);
    }
  }
}

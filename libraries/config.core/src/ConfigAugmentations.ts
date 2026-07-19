// The public convenience augmentations over IConfig -- port of the reference
// `ConfigurationExtensions.cs` (the IConfig-receiver half). These are runtime
// functions defined against the abstraction interfaces only, so they belong in
// config.core (the assembly mirroring the reference's
// `.Configuration.Abstractions`), NOT in the engine package.
//
// This is a CLOSED augmentation set (docs/decisions.md §28/§38): the receiver
// interface (IConfig) AND every one of these augmentations are owned inside the
// config family, and no downstream package extends this surface. The member set
// is authored here as ONE named exported const mirroring the reference static
// class, so it is available BOTH as a fluent method
// (`config.getConnectionString(name)`) and as the standalone member form
// (`ConfigAugmentations.getConnectionString(config, name)`). The install itself
// -- the `applyAugmentations` calls and the `declare module` merges onto the
// concrete classes -- lives in @rhombus-std/config, since those reference
// concrete classes config.core cannot import.
//
// `exists` is deliberately NOT a member of the set: the reference receiver is a
// nullable `IConfigurationSection?`, and a prototype method cannot dispatch on
// an `undefined` receiver, so it stays a plain exported free function.
//
// The generic `Add<TSource>(configureSource)` factory-add from the same
// reference file is intentionally not ported (candidate intentional deviation
// -- no consumer, and the `new TSource()` pattern has no faithful TS analog);
// if ever ported it targets IConfigBuilder, so per the single-receiver
// split rule it becomes a SEPARATE builder-targeted const, never folded here.

import type { AugmentationSet } from '@rhombus-std/primitives';
import { isConfigSection } from './config-section-guard';
import type { IConfig } from './IConfig';
import type { IConfigSection } from './IConfigSection';

/**
 * Whether `section` has a {@link IConfigSection.value} or at least one
 * child. Returns `false` for a nullish section. The child probe stops at the
 * first result rather than materializing the whole child list.
 *
 * Stays a free function (not a member of {@link ConfigAugmentations}): the
 * reference receiver is nullable, and a prototype method cannot dispatch on an
 * `undefined` receiver.
 */
export function exists(section: IConfigSection | undefined): boolean {
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
 * One named object literal mirroring the reference `ConfigurationExtensions`
 * static class (docs §28/§38) -- receiver-first members over IConfig.
 * Installed directly (CLOSED set, no token) onto every concrete IConfig
 * class AND exported so the members are the standalone form.
 */
export const ConfigAugmentations = {
  /**
   * The specified connection string from `config`. Shorthand for
   * `config.getSection("ConnectionStrings").get(name)`.
   */
  getConnectionString(config: IConfig, name: string): string | undefined {
    return config.getSection('ConnectionStrings').get(name);
  },

  /**
   * The configuration subsection with the specified `key`. Unlike
   * {@link IConfig.getSection} -- which always returns a (possibly
   * empty) section -- this throws when no matching section {@link exists}.
   */
  getRequiredSection(config: IConfig, key: string): IConfigSection {
    const section = config.getSection(key);
    if (exists(section)) {
      return section;
    }
    throw new Error(`There is no configuration section with key "${key}".`);
  },

  /**
   * Enumerates the key/value pairs within `config` as a depth-first walk
   * of the section tree. When `makePathsRelative` is `true`, the enumeration
   * root's path is trimmed from the front of each returned key (and the root's
   * own -- now empty -- key is skipped).
   *
   * Mirrors the reference's stack-based DFS. The section-vs-root distinction is
   * load bearing: the port's {@link IConfig} root exposes an empty `path` yet
   * is NOT an {@link IConfigSection}, so the enumeration root is only
   * yielded (and only contributes a relative prefix) when it is a genuine
   * section -- tested via {@link isConfigSection}, never duck-typed on `path`.
   * Every node reached through `getChildren()` is a section by the interface
   * contract.
   */
  *asIterable(
    config: IConfig,
    // Annotated: AugmentationSet<R>'s index signature (`...args: any[]`)
    // contextually types the parameter `any`, beating default-value inference.
    makePathsRelative: boolean = false,
  ): Generator<[key: string, value: string | undefined], void, unknown> {
    const rootIsSection = isConfigSection(config);
    // Trim the root section's path plus its trailing delimiter; a non-section
    // root contributes no prefix.
    const prefixLength = makePathsRelative && rootIsSection ? config.path.length + 1 : 0;

    const stack: IConfig[] = [config];
    while (stack.length) {
      const node = stack.pop()!;
      const isSection = node === config ? rootIsSection : true;
      // Skip the enumeration root itself when trimming paths -- its relative
      // key would be empty.
      if (isSection && (!makePathsRelative || node !== config)) {
        const section = node as IConfigSection;
        yield [section.path.substring(prefixLength), section.value];
      }
      for (const child of node.getChildren()) {
        stack.push(child);
      }
    }
  },
} satisfies AugmentationSet<IConfig>;

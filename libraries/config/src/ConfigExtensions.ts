// The public MECA convenience augmentations over IConfig -- port of
// `ConfigExtensions.cs` (the IConfig-receiver half). These are
// runtime functions, so they live in @rhombus-std/config (not config.core,
// which ships zero runtime values -- see docs/decisions.md).
//
// This is a CLOSED augmentation set (docs/decisions.md §28/§38): the receiver
// interface (IConfig) AND every one of these augmentations are owned
// inside the config family, and no downstream package extends this surface, so
// the install is a direct `applyAugmentations` at the concrete classes -- NO
// token, NO registry. The set is authored as ONE named exported const mirroring
// the reference static class, so it is available BOTH as a fluent method
// (`config.getConnectionString(name)`) and as the standalone member form
// (`ConfigExtensions.getConnectionString(config, name)`).
//
// `exists` is deliberately NOT a member of the set: the reference receiver is a
// nullable `IConfigSection?`, and a prototype method cannot dispatch on
// an `undefined` receiver, so it stays a plain exported free function.
//
// The generic `Add<TSource>(configureSource)` factory-add from the same
// reference file is intentionally not ported (candidate intentional deviation
// -- no consumer, and the `new TSource()` pattern has no faithful TS analog);
// if ever ported it targets IConfigBuilder, so per the single-receiver
// split rule it becomes a SEPARATE builder-targeted const, never folded here.

import type { IConfig, IConfigSection } from '@rhombus-std/config.core';
import { applyAugmentations, type AugmentationSet } from '@rhombus-std/primitives';
import { ConfigManager } from './ConfigManager';
import { ConfigRoot } from './ConfigRoot';
import { ConfigSection } from './ConfigSection';

/**
 * Whether `section` has a {@link IConfigSection.value} or at least one
 * child. Returns `false` for a nullish section. The child probe stops at the
 * first result rather than materializing the whole child list.
 *
 * Stays a free function (not a member of {@link ConfigExtensions}): the
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
 * One named object literal mirroring the reference `ConfigExtensions`
 * static class (docs §28/§38) -- receiver-first members over IConfig.
 * Installed directly (CLOSED set, no token) onto every concrete IConfig
 * class AND exported so the members are the standalone form.
 */
export const ConfigExtensions = {
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
   * Mirrors MECA's stack-based DFS. The section-vs-root distinction is load
   * bearing: the port's {@link ConfigRoot} exposes an empty `path` yet
   * is NOT an {@link IConfigSection}, so the enumeration root is only
   * yielded (and only contributes a relative prefix) when it is a genuine
   * section -- tested via `instanceof`, never duck-typed on `path`. Every node
   * reached through `getChildren()` is a section by the interface contract.
   */
  *asEnumerable(
    config: IConfig,
    // Annotated: AugmentationSet<R>'s index signature (`...args: any[]`)
    // contextually types the parameter `any`, beating default-value inference.
    makePathsRelative: boolean = false,
  ): Generator<[key: string, value: string | undefined]> {
    const rootIsSection = config instanceof ConfigSection;
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

// DELIBERATELY no interface-side merge onto IConfig. This is a CLOSED
// set, and IConfig has MANY implementers -- the three concrete classes
// below, plus every wrapper/fake a consumer hands to e.g.
// ChainedConfigProvider. An interface merge would force those
// implementers to carry members that are only ever installed on OUR concrete
// prototypes (phantom methods -- typed but absent at runtime), the same
// several-impls reasoning that kept ILogger's log* wrappers standalone-only
// (docs §36/§38). The fluent form is typed per concrete class below; an
// interface-typed value uses the standalone `ConfigExtensions.*` form.
declare module './ConfigRoot' {
  interface ConfigRoot {
    getConnectionString(name: string): string | undefined;
    getRequiredSection(key: string): IConfigSection;
    asEnumerable(makePathsRelative?: boolean): Generator<[key: string, value: string | undefined]>;
  }
}

declare module './ConfigSection' {
  interface ConfigSection {
    getConnectionString(name: string): string | undefined;
    getRequiredSection(key: string): IConfigSection;
    asEnumerable(makePathsRelative?: boolean): Generator<[key: string, value: string | undefined]>;
  }
}

declare module './ConfigManager' {
  interface ConfigManager {
    getConnectionString(name: string): string | undefined;
    getRequiredSection(key: string): IConfigSection;
    asEnumerable(makePathsRelative?: boolean): Generator<[key: string, value: string | undefined]>;
  }
}

applyAugmentations(ConfigRoot, ConfigExtensions);
applyAugmentations(ConfigSection, ConfigExtensions);
applyAugmentations(ConfigManager, ConfigExtensions);

// Convenience members over IConfig, callable as a fluent method
// (`config.getConnectionString(name)`) or as the standalone form
// (`ConfigAugmentations.getConnectionString(config, name)`). The install onto the
// concrete IConfig classes lives in @rhombus-std/config, which can import them.

import type { AugmentationSet } from '@rhombus-std/primitives';
import { isConfigSection } from './config-section-guard';
import type { IConfig } from './IConfig';
import type { IConfigSection } from './IConfigSection';

/**
 * Whether `section` has a {@link IConfigSection.value} or at least one child;
 * `false` for a nullish section.
 *
 * @remarks
 * A free function rather than a member of {@link ConfigAugmentations}, so it can
 * be called on a possibly-`undefined` section — a prototype method could not.
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

/** Receiver-first convenience members over {@link IConfig}. */
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
   * Enumerates `config`'s key/value pairs as a depth-first walk of the section
   * tree. With `makePathsRelative`, the enumeration root's path is trimmed from
   * the front of each key (and the root's own now-empty key is skipped).
   *
   * @remarks
   * The enumeration root is yielded only when it is itself a section; a bare
   * {@link IConfig} root (empty `path`, not a section) contributes no entry.
   */
  *asIterable(config: IConfig,
    makePathsRelative: boolean = false): Generator<[key: string, value: string | undefined], void, unknown>
  {
    const rootIsSection = isConfigSection(config);
    const prefixLength = makePathsRelative && rootIsSection ? config.path.length + 1 : 0;

    const stack: IConfig[] = [config];
    while (stack.length) {
      const node = stack.pop()!;
      const isSection = node === config ? rootIsSection : true;
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

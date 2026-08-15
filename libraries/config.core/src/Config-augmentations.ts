// Convenience members over IConfig, callable as a fluent method
// (`config.getConnectionString(name)`) or standalone as
// (`ConfigAugmentations.getConnectionString.call(config, name)`).

import type { Flatten } from '@rhombus-toolkit/type-helpers';
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

/** Convenience members over {@link IConfig}. */
export namespace ConfigAugmentations {
  /**
   * The specified connection string from `config`. Shorthand for
   * `config.getSection("ConnectionStrings").get(name)`.
   */
  export function getConnectionString(this: IConfig, name: string): string | undefined {
    return this.getSection('ConnectionStrings').get(name);
  }

  /**
   * The configuration subsection with the specified `key`. Unlike
   * {@link IConfig.getSection} -- which always returns a (possibly
   * empty) section -- this throws when no matching section {@link exists}.
   */
  export function getRequiredSection(this: IConfig, key: string): IConfigSection {
    const section = this.getSection(key);
    if (exists(section)) {
      return section;
    }
    throw new Error(`There is no configuration section with key "${key}".`);
  }

  /**
   * Enumerates `config`'s key/value pairs as a depth-first walk of the section
   * tree. With `makePathsRelative`, the enumeration root's path is trimmed from
   * the front of each key (and the root's own now-empty key is skipped).
   *
   * @remarks
   * The enumeration root is yielded only when it is itself a section; a bare
   * {@link IConfig} root (empty `path`, not a section) contributes no entry.
   */
  export function* asIterable(this: IConfig,
    makePathsRelative: boolean = false): Generator<[key: string, value: string | undefined], void, unknown> {
    const rootIsSection = isConfigSection(this);
    const prefixLength = makePathsRelative && rootIsSection ? this.path.length + 1 : 0;

    const stack: IConfig[] = [this];
    while (stack.length) {
      const node = stack.pop()!;
      const isSection = node === this ? rootIsSection : true;
      if (isSection && (!makePathsRelative || node !== this)) {
        const section = node as IConfigSection;
        yield [section.path.substring(prefixLength), section.value];
      }
      for (const child of node.getChildren()) {
        stack.push(child);
      }
    }
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfig extends Flatten<typeof ConfigAugmentations> {}
}

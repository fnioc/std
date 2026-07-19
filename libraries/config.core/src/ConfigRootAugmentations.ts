// The public debug-view augmentation over IConfigRoot -- port of the reference
// `ConfigurationRootExtensions.cs` (and the `ConfigurationDebugViewContext`
// struct it depends on, collapsed to a plain type). A runtime function defined
// against the abstraction interfaces only, so it belongs in config.core (the
// assembly mirroring the reference's `.Configuration.Abstractions`).
//
// This is a CLOSED augmentation set (docs/decisions.md §28/§38): the receiver
// interface (IConfigRoot) AND this augmentation are owned inside the config
// family with no downstream extender. The member set is authored here as ONE
// named exported const, so `getDebugView` is available BOTH as a fluent method
// (`root.getDebugView()`) and as the standalone member form
// (`ConfigRootAugmentations.getDebugView(root)`). The install -- the
// `applyAugmentations` calls and `declare module` merges onto the concrete root
// classes -- lives in @rhombus-std/config.

import type { AugmentationSet } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { IConfigProvider } from './IConfigProvider';
import type { IConfigRoot } from './IConfigRoot';
import type { IConfigSection } from './IConfigSection';

/**
 * Data about the current item of the configuration, handed to the
 * `processValue` callback of {@link ConfigRootAugmentations.getDebugView}.
 * Mirrors the fields of the reference runtime's `ConfigurationDebugViewContext`
 * struct as a runtime-free type.
 */
export type ConfigDebugViewContext = {
  /** The path of the current item. */
  readonly path: string;
  /** The key of the current item. */
  readonly key: string;
  /** The value of the current item. */
  readonly value: string | undefined;
  /** The provider that supplied the value of the current item. */
  readonly provider: IConfigProvider;
};

/** The value/provider that last defined `key`, scanning providers in reverse. */
function getValueAndProvider(
  root: IConfigRoot,
  key: string,
): [value: string | undefined, provider: IConfigProvider] | undefined {
  const providers = [...root.providers].reverse();
  for (const provider of providers) {
    const result = provider.tryGet(key);
    if (result[0]) {
      return [result[1], provider];
    }
  }
  return undefined;
}

/**
 * One named object literal mirroring the reference `ConfigurationRootExtensions`
 * static class (docs §28/§38) -- a receiver-first member over
 * IConfigRoot. Installed directly (CLOSED set, no token) onto the
 * concrete root classes AND exported so the member is the standalone form.
 */
export const ConfigRootAugmentations = {
  /**
   * A human-readable view of the configuration showing where each value came
   * from. Each leaf is rendered `key=value (provider)`; an intermediate node
   * with no directly-defined value is rendered `key:`. `processValue` may
   * transform a leaf's rendered value, e.g. to hide secrets.
   *
   * The provider label is `String(provider)` -- the base `ConfigProvider`
   * renders the concrete class name by default (e.g. "JsonConfigProvider"),
   * and a provider may override `toString` further to add its own detail (the
   * JSON provider adds its path and optional flag).
   */
  getDebugView(
    root: IConfigRoot,
    processValue?: Func<[ConfigDebugViewContext], string>,
  ): string {
    const parts: string[] = [];

    const recurse = (children: Iterable<IConfigSection>, indent: string): void => {
      for (const child of children) {
        const found = getValueAndProvider(root, child.path);
        if (found) {
          const [value, provider] = found;
          const rendered = processValue
            ? processValue({ path: child.path, key: child.key, value, provider })
            : value;
          parts.push(`${indent}${child.key}=${rendered} (${String(provider)})\n`);
        } else {
          parts.push(`${indent}${child.key}:\n`);
        }
        recurse(child.getChildren(), `${indent}  `);
      }
    };

    recurse(root.getChildren(), '');
    return parts.join('');
  },
} satisfies AugmentationSet<IConfigRoot>;

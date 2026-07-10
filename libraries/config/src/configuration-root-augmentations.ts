// The public MECA debug-view augmentation over IConfigurationRoot -- port of
// `ConfigurationRootExtensions.cs` (and the `ConfigurationDebugViewContext`
// struct it depends on, collapsed to a plain type). A runtime function, so it
// lives in @rhombus-std/config rather than config.core.
//
// This is a CLOSED augmentation set (docs/decisions.md §28/§38): the receiver
// interface (IConfigurationRoot) AND this augmentation are owned inside the
// config family with no downstream extender, so the install is a direct
// `applyAugmentations` at the concrete root classes -- NO token, NO registry.
// Authored as ONE named exported const, so `getDebugView` is available BOTH as
// a fluent method (`root.getDebugView()`) and as the standalone member form
// (`ConfigurationRootExtensions.getDebugView(root)`).

import type { IConfigurationProvider, IConfigurationRoot, IConfigurationSection } from "@rhombus-std/config.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { ConfigurationManager } from "./ConfigurationManager";
import { ConfigurationRoot } from "./ConfigurationRoot";

/**
 * Data about the current item of the configuration, handed to the
 * `processValue` callback of {@link ConfigurationRootExtensions.getDebugView}.
 * Mirrors the fields of the reference runtime's `ConfigurationDebugViewContext`
 * struct as a runtime-free type.
 */
export type ConfigurationDebugViewContext = {
  /** The path of the current item. */
  readonly path: string;
  /** The key of the current item. */
  readonly key: string;
  /** The value of the current item. */
  readonly value: string | undefined;
  /** The provider that supplied the value of the current item. */
  readonly provider: IConfigurationProvider;
};

/** The value/provider that last defined `key`, scanning providers in reverse. */
function getValueAndProvider(
  root: IConfigurationRoot,
  key: string,
): [value: string | undefined, provider: IConfigurationProvider] | undefined {
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
 * IConfigurationRoot. Installed directly (CLOSED set, no token) onto the
 * concrete root classes AND exported so the member is the standalone form.
 */
export const ConfigurationRootExtensions = {
  /**
   * A human-readable view of the configuration showing where each value came
   * from. Each leaf is rendered `key=value (provider)`; an intermediate node
   * with no directly-defined value is rendered `key:`. `processValue` may
   * transform a leaf's rendered value, e.g. to hide secrets.
   *
   * The provider label is `String(provider)` -- the base `ConfigurationProvider`
   * renders the concrete class name by default (e.g. "JsonConfigurationProvider"),
   * and a provider may override `toString` further to add its own detail (the
   * JSON provider adds its path and optional flag).
   */
  getDebugView(
    root: IConfigurationRoot,
    processValue?: (context: ConfigurationDebugViewContext) => string,
  ): string {
    const parts: string[] = [];

    const recurse = (children: Iterable<IConfigurationSection>, indent: string): void => {
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

    recurse(root.getChildren(), "");
    return parts.join("");
  },
} satisfies AugmentationSet<IConfigurationRoot>;

// DELIBERATELY no interface-side merge onto IConfigurationRoot -- same
// several-impls reasoning as ConfigurationExtensions (see
// ./configuration-augmentations): a merge would force phantom members onto
// every wrapper/fake implementer. The fluent form is typed per concrete class
// below; an interface-typed root uses the standalone
// `ConfigurationRootExtensions.getDebugView` form.
declare module "./ConfigurationRoot" {
  interface ConfigurationRoot {
    getDebugView(processValue?: (context: ConfigurationDebugViewContext) => string): string;
  }
}

declare module "./ConfigurationManager" {
  interface ConfigurationManager {
    getDebugView(processValue?: (context: ConfigurationDebugViewContext) => string): string;
  }
}

applyAugmentations(ConfigurationRoot, ConfigurationRootExtensions);
applyAugmentations(ConfigurationManager, ConfigurationRootExtensions);

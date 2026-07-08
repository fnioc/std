// The public MECA debug-view helper over IConfigurationRoot -- port of
// `ConfigurationRootExtensions.cs` (and the `ConfigurationDebugViewContext`
// struct it depends on, collapsed to a plain type). A runtime function, so it
// lives in @rhombus-std/config rather than config.core.

import type { IConfigurationProvider, IConfigurationRoot, IConfigurationSection } from "@rhombus-std/config.core";

/**
 * Data about the current item of the configuration, handed to the
 * `processValue` callback of {@link getDebugView}. Mirrors the fields of
 * the reference runtime's `ConfigurationDebugViewContext` struct as a
 * runtime-free type.
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
export function getDebugView(
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
}

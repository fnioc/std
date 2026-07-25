// A convenience member over IConfigRoot, callable as a fluent method
// (`root.getDebugView()`) or as the standalone form
// (`ConfigRootAugmentations.getDebugView(root)`). The install onto the concrete
// IConfigRoot classes lives in @rhombus-std/config, which can import them.

import type { AugmentationSet } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { IConfigProvider } from './IConfigProvider';
import type { IConfigRoot } from './IConfigRoot';
import type { IConfigSection } from './IConfigSection';

/**
 * Data about the current item of the configuration, handed to the
 * `processValue` callback of {@link ConfigRootAugmentations.getDebugView}.
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
function getValueAndProvider(root: IConfigRoot, key: string): [value: string | undefined, provider: IConfigProvider]
  | undefined
{
  const providers = [...root.providers].reverse();
  for (const provider of providers) {
    const result = provider.tryGet(key);
    if (result[0]) {
      return [result[1], provider];
    }
  }
  return undefined;
}

/** Receiver-first convenience member over {@link IConfigRoot}. */
export const ConfigRootAugmentations = {
  /**
   * A human-readable view of the configuration showing where each value came
   * from. Each leaf is rendered `key=value (provider)`; an intermediate node
   * with no directly-defined value is rendered `key:`. `processValue` may
   * transform a leaf's rendered value, e.g. to hide secrets.
   *
   * @remarks
   * The `(provider)` label is `String(provider)` — a provider's `toString`
   * override supplies any distinguishing detail (e.g. a file path).
   */
  getDebugView(root: IConfigRoot, processValue?: Func<[ConfigDebugViewContext], string>): string {
    const parts: string[] = [];

    const recurse = (children: Iterable<IConfigSection>, indent: string): void => {
      for (const child of children) {
        const found = getValueAndProvider(root, child.path);
        if (found) {
          const [value, provider] = found;
          const rendered = processValue ? processValue({ path: child.path, key: child.key, value, provider }) : value;
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

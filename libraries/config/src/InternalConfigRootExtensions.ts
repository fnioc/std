// Internal child-enumeration helper shared by the root, the manager, and
// every section: exported for the package's own call sites only, never
// re-exported from the barrel, and never installed on a prototype (no
// `applyAugmentations`, no registry token) -- call sites use the standalone
// member form, `InternalConfigRootExtensions.getChildrenImplementation(root, path)`.

import { configPath, type IConfigRoot, type IConfigSection } from '@rhombus-std/config.core';
import type { AugmentationSet } from '@rhombus-std/primitives';
import { foldKey } from './fold-key';

/** Receiver-first members over {@link IConfigRoot}, intra-package only. */
export const InternalConfigRootExtensions = {
  /**
   * Shared child-enumeration for the root, the manager, and their sections.
   * Folds each provider's `getChildKeys` forward (so the last provider sorts
   * the whole accumulated list), dedups ordinal-ignore-case keeping first
   * occurrence (dedup is the ROOT's job, not the provider's), then maps to
   * sections of `root`.
   */
  getChildrenImplementation(root: IConfigRoot, path: string | undefined): IConfigSection[] {
    let keys: Iterable<string> = [];
    for (const provider of root.providers) {
      keys = provider.getChildKeys(keys, path);
    }

    const seen = new Set<string>();
    const distinct: string[] = [];
    for (const key of keys) {
      const folded = foldKey(key);
      if (!seen.has(folded)) {
        seen.add(folded);
        distinct.push(key);
      }
    }

    return distinct.map((key) => root.getSection(path === undefined ? key : configPath.combine(path, key)));
  },
} satisfies AugmentationSet<IConfigRoot>;

// The INTERNAL child-enumeration helper shared by the root, the manager, and
// every section -- port of the reference `InternalConfigurationRootExtensions`
// static class. Same object-literal shape as the public augmentation sets
// (docs/decisions.md §28/§42), `satisfies AugmentationSet<IConfigurationRoot>`,
// but INTERNAL like its reference: exported for the package's own call sites
// only, never re-exported from the barrel, and never installed on a prototype
// (no `applyAugmentations`, no registry token) -- call sites use the standalone
// member form, `InternalConfigurationRootExtensions.getChildrenImplementation(root, path)`.
//
// Two reference members are deliberately not mirrored here:
//   - The `ConfigurationManager` reference-counted-providers branch inside
//     `getChildrenImplementation` (GetProvidersReference + the eager ToList):
//     the copy-on-write provider list it guards is itself unported (see
//     ./ConfigurationManager.ts -- no concurrent-reader story in a
//     single-threaded runtime), so `root.providers` is always the live list.
//   - `tryGetConfiguration` (the reverse-scan value lookup behind the reference
//     section's value getter): this port routes every section read through
//     `ConfigurationRoot.get`, whose private `#rawGet` IS that reverse scan, so
//     a second copy here would have no call site.

import type { IConfigurationRoot, IConfigurationSection } from "@rhombus-std/config.core";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { combine } from "./abstractions/configuration-path";
import { foldKey } from "./fold-key";

/**
 * One named object literal mirroring the reference
 * `InternalConfigurationRootExtensions` internal static class (docs §28/§38) --
 * receiver-first members over {@link IConfigurationRoot}, intra-package only.
 */
export const InternalConfigurationRootExtensions = {
  /**
   * Shared child-enumeration for the root, the manager, and their sections.
   * Folds each provider's `getChildKeys` forward (so the last provider sorts
   * the whole accumulated list), dedups ordinal-ignore-case keeping first
   * occurrence (dedup is the ROOT's job, not the provider's), then maps to
   * sections of `root`.
   */
  getChildrenImplementation(root: IConfigurationRoot, path: string | undefined): IConfigurationSection[] {
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

    return distinct.map((key) => root.getSection(path === undefined ? key : combine(path, key)));
  },
} satisfies AugmentationSet<IConfigurationRoot>;

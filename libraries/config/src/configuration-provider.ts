// ConfigurationProvider -- abstract base for every provider.
//
// Holds a case-insensitive, casing-preserving key/value store: the internal
// Map is keyed by `key.toLowerCase()` and stores the original-cased key
// alongside its value. tryGet/set fold case; the first-inserted casing is
// preserved on later writes (so re-setting an existing key under different
// casing keeps the casing it was first stored with).
// load() is a no-op by default -- concrete providers override it.

import type { IConfigurationProvider, ITryGetResult } from "@rhombus-std/config.core";
import { KeyDelimiter } from "./abstractions/configuration-path";
import { compareConfigurationKeys } from "./configuration-key-comparer";
import { foldKey } from "./fold-key";

/**
 * Returns the configuration segment of `key` starting at `prefixLength`, up
 * to (but excluding) the next delimiter, or the remainder of the key if there
 * is no further delimiter.
 */
function segment(key: string, prefixLength: number): string {
  const delimiterIndex = key.indexOf(KeyDelimiter, prefixLength);
  return delimiterIndex < 0
    ? key.slice(prefixLength)
    : key.slice(prefixLength, delimiterIndex);
}

/**
 * Base class for configuration providers. Concrete providers populate the
 * store in {@link load} (or a constructor, for the in-memory case) via
 * {@link set}, and the rest of the {@link IConfigurationProvider} contract is
 * served from the store here.
 */
export abstract class ConfigurationProvider implements IConfigurationProvider {
  /** lowercased-key -> [original-cased key, value]. */
  protected readonly data = new Map<string, [key: string, value: string]>();

  /** Case-insensitive lookup. */
  public tryGet(key: string): ITryGetResult<string> {
    const hit = this.data.get(foldKey(key));
    return hit === undefined ? [false] : [true, hit[1]];
  }

  /**
   * Case-insensitive write. Preserves the first-inserted casing of the key on
   * subsequent writes.
   */
  public set(key: string, value?: string): void {
    const folded = foldKey(key);
    const existing = this.data.get(folded);
    this.data.set(folded, [existing?.[0] ?? key, value ?? ""]);
  }

  /** No-op by default; concrete providers load their source here. */
  public load(): void {}

  /**
   * Returns the immediate descendant keys for `parentPath`, combined with the
   * `earlierKeys` returned by preceding providers, sorted by
   * {@link compareConfigurationKeys}. Does NOT dedup -- the root does that.
   */
  public getChildKeys(earlierKeys: Iterable<string>, parentPath?: string): Iterable<string> {
    const results: string[] = [];

    if (parentPath === undefined) {
      for (const [, [originalKey]] of this.data) {
        results.push(segment(originalKey, 0));
      }
    } else {
      const foldedParent = foldKey(parentPath);
      for (const [, [originalKey]] of this.data) {
        if (
          originalKey.length > parentPath.length
          && foldKey(originalKey).startsWith(foldedParent)
          && originalKey[parentPath.length] === KeyDelimiter
        ) {
          results.push(segment(originalKey, parentPath.length + 1));
        }
      }
    }

    for (const earlier of earlierKeys) {
      results.push(earlier);
    }

    results.sort(compareConfigurationKeys);
    return results;
  }
}

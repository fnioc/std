// ConfigurationProvider -- abstract base for every provider.
//
// Holds a case-insensitive, casing-preserving key/value store: the internal
// Map is keyed by `key.toLowerCase()` and stores the original-cased key
// alongside its value. tryGet/set fold case; the first-inserted casing is
// preserved on later writes (so re-setting an existing key under different
// casing keeps the casing it was first stored with).
// load() is a no-op by default -- concrete providers override it.

import type { IConfigurationProvider, ITryGetResult } from "@rhombus-std/config.core";
import type { IChangeToken } from "@rhombus-std/primitives";
import { KeyDelimiter } from "./abstractions/configuration-path";
import { compareConfigurationKeys } from "./configuration-key-comparer";
import { ConfigurationReloadToken } from "./configuration-reload-token";
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

  #reloadToken = new ConfigurationReloadToken();

  /** The current reload token; fires when {@link onReload} runs. */
  public getReloadToken(): IChangeToken {
    return this.#reloadToken;
  }

  /**
   * Fires the current reload token and swaps in a fresh one, so a later
   * change is observable too. Concrete providers call this from {@link load}
   * once their data has actually been refreshed from the source -- the base
   * {@link load} no-op never calls it.
   */
  protected onReload(): void {
    const previous = this.#reloadToken;
    this.#reloadToken = new ConfigurationReloadToken();
    previous.onReload();
  }

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
   * A friendly label for this provider, shown by {@link getDebugView}.
   * Defaults to the concrete class name (e.g. "JsonConfigurationProvider") --
   * relies on unminified dist output, true today (see
   * `scripts/build-package.ts`); if minification ever lands, a hardcoded
   * per-class override is the fallback. A subclass whose bare class name
   * isn't informative enough (e.g. one that wants to show its file path)
   * overrides this directly.
   */
  public toString(): string {
    return this.constructor.name;
  }

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

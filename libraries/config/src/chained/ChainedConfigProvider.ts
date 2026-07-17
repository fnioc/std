// ChainedConfigProvider -- delegates every read/write straight through
// to the wrapped IConfig, rather than holding its own key/value store.
// Implements IConfigProvider DIRECTLY: unlike every other provider in
// this package, it has no data of its own to keep in the case-insensitive
// dictionary the abstract ConfigProvider base provides, so extending
// that base would only add an unused store.

import type { IConfig, IConfigProvider, IConfigRoot, ITryGetResult } from '@rhombus-std/config.core';
import type { IChangeToken } from '@rhombus-std/primitives';
import { compareConfigKeys } from '../config-key-comparer';
import type { ChainedConfigSource } from './ChainedConfigSource';

/**
 * Duck-types `config` as an {@link IConfigRoot}: TS interfaces have no
 * runtime tag, so this checks for the one member (`reload`) that only a root
 * carries -- neither a plain section nor `IConfig` has it. Mirrors the
 * reference's `_config is IConfigRoot` type test.
 */
function isConfigRoot(config: IConfig): config is IConfigRoot {
  return typeof (config as Partial<IConfigRoot>).reload === 'function';
}

/** A provider that presents an existing {@link IConfig} as a chained source. */
export class ChainedConfigProvider implements IConfigProvider, Disposable {
  readonly #config: IConfig;
  readonly #shouldDisposeConfig: boolean;
  #initialLoadCompleted = false;

  public constructor(source: ChainedConfigSource) {
    this.#config = source.config;
    this.#shouldDisposeConfig = source.shouldDisposeConfig;
  }

  /** Case-insensitive lookup, delegated to the chained configuration. Empty-string values count as a miss. */
  public tryGet(key: string): ITryGetResult<string> {
    const value = this.#config.get(key);
    return value ? [true, value] : [false];
  }

  /** Writes through to the chained configuration. */
  public set(key: string, value?: string): void {
    this.#config.set(key, value ?? '');
  }

  /** The chained configuration's own reload token. */
  public getReloadToken(): IChangeToken {
    return this.#config.getReloadToken();
  }

  /**
   * The first call is a no-op -- the chained configuration is expected to
   * already be built (and loaded) by the time it's chained in, so treating
   * construction as a load would raise a spurious change notification. A
   * later call (a real reload of the OUTER configuration) forces every
   * provider of the chained configuration to reload, when it is itself a root.
   */
  public load(): void {
    if (!this.#initialLoadCompleted) {
      this.#initialLoadCompleted = true;
      return;
    }

    if (isConfigRoot(this.#config)) {
      for (const provider of this.#config.providers) {
        provider.load();
      }
    }
  }

  /**
   * Combines the chained configuration's own immediate children under
   * `parentPath` with `earlierKeys`, sorted -- the same "own keys first, then
   * earlier, then sort" shape as {@link ConfigProvider.getChildKeys}, just
   * sourced from the chained configuration's real section tree instead of a
   * flat key/value store.
   */
  public getChildKeys(earlierKeys: Iterable<string>, parentPath?: string): Iterable<string> {
    const section = parentPath === undefined ? this.#config : this.#config.getSection(parentPath);
    const keys: string[] = [];
    for (const child of section.getChildren()) {
      keys.push(child.key);
    }
    for (const earlier of earlierKeys) {
      keys.push(earlier);
    }
    keys.sort(compareConfigKeys);
    return keys;
  }

  /**
   * A friendly label for this provider, shown by {@link getDebugView} -- see
   * the base {@link ConfigProvider.toString} this class doesn't inherit
   * (it implements the interface directly, not that base).
   */
  public toString(): string {
    return this.constructor.name;
  }

  /** Disposes the chained configuration, but only when the source opted in via `shouldDisposeConfig`. */
  public [Symbol.dispose](): void {
    if (this.#shouldDisposeConfig) {
      (this.#config as Partial<Disposable>)[Symbol.dispose]?.();
    }
  }
}

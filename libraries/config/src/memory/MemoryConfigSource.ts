// MemoryConfigSource / the initial-data shape it carries. Bundled
// directly into `@rhombus-std/config` (not a separate provider package) --
// an in-memory source is a core building block, not an optional add-on.

import type { IConfigBuilder, IConfigProvider, IConfigSource } from '@rhombus-std/config.core';
import { MemoryConfigProvider } from './MemoryConfigProvider';

/**
 * In-memory initial data: either an iterable of `[key, value]` pairs (a `Map`,
 * an array of tuples, ...) or a plain `Record` of key -> value. Both are
 * accepted for ergonomics; a `Record` is the idiomatic literal form.
 */
export type ConfigData =
  | Iterable<readonly [string, string]>
  | Record<string, string>;

/** Normalizes {@link ConfigData} to an iterable of `[key, value]` pairs. */
export function toEntries(data: ConfigData): Iterable<readonly [string, string]> {
  return Symbol.iterator in data
    ? (data as Iterable<readonly [string, string]>)
    : Object.entries(data);
}

/** A configuration source backed by an in-memory key/value collection. */
export class MemoryConfigSource implements IConfigSource {
  /** The initial data to seed the provider with. */
  public initialData?: ConfigData;

  public constructor(options?: { initialData?: ConfigData; }) {
    this.initialData = options?.initialData;
  }

  public build(_builder: IConfigBuilder): IConfigProvider {
    return new MemoryConfigProvider(this);
  }
}

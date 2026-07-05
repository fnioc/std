// MemoryConfigurationSource / the initial-data shape it carries. Bundled
// directly into `@rhombus-std/config` (not a separate provider package) --
// an in-memory source is a core building block, not an optional add-on.

import type { IConfigurationBuilder, IConfigurationProvider, IConfigurationSource } from "@rhombus-std/config.core";
import { MemoryConfigurationProvider } from "./memory-configuration-provider";

/**
 * In-memory initial data: either an iterable of `[key, value]` pairs (a `Map`,
 * an array of tuples, ...) or a plain `Record` of key -> value. Both are
 * accepted for ergonomics; a `Record` is the idiomatic literal form.
 */
export type ConfigurationData =
  | Iterable<readonly [string, string]>
  | Record<string, string>;

/** Normalizes {@link ConfigurationData} to an iterable of `[key, value]` pairs. */
export function toEntries(data: ConfigurationData): Iterable<readonly [string, string]> {
  return Symbol.iterator in data
    ? (data as Iterable<readonly [string, string]>)
    : Object.entries(data);
}

/** A configuration source backed by an in-memory key/value collection. */
export class MemoryConfigurationSource implements IConfigurationSource {
  /** The initial data to seed the provider with. */
  public initialData?: ConfigurationData;

  public constructor(options?: { initialData?: ConfigurationData }) {
    this.initialData = options?.initialData;
  }

  public build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new MemoryConfigurationProvider(this);
  }
}

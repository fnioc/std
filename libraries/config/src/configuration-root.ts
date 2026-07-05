// ConfigurationRoot -- the provider-list engine, presented as the empty-path
// Section at the top of the tree.
//
// Providers are stored in registration order and eagerly load()ed at
// construction. Reads resolve LAST-registered-wins by iterating providers in
// REVERSE per lookup (a lazy, per-key resolution -- not an eager merge into a
// flat map). Writes fan out to EVERY provider in forward order.
//
// The root also carries the section trio (key/path/value, all empty/undefined
// sentinels) and extends IndexAccessed, so `build()` can present it as the
// index-navigable root of the Section tree. See configuration-section.ts for
// the reserved-name hazard (real members, incl. `getChildrenImplementation`,
// shadow the indexer).

import type {
  DeepRecord,
  IConfigurationProvider,
  IConfigurationRoot,
  IConfigurationSection,
  IndexedSection,
} from "@rhombus-std/config.core";
import { IndexAccessed } from "@rhombus-toolkit/proxy-base";
import { combine } from "./abstractions/configuration-path";
import { parseBoolean, parseNumber } from "./coerce";
import { ConfigurationSection, subtreeToObject } from "./configuration-section";

export class ConfigurationRoot extends IndexAccessed<IndexedSection> implements IConfigurationRoot {
  readonly #providers: IConfigurationProvider[];

  /**
   * Stores `providers` in registration order and eagerly loads each, forward
   * order, so the root reflects every source's data immediately after
   * construction.
   */
  public constructor(providers: Iterable<IConfigurationProvider>) {
    super();
    this.#providers = [...providers];
    for (const provider of this.#providers) {
      provider.load();
    }
  }

  /** The root sentinel: empty key. */
  public get key(): string {
    return "";
  }

  /** The root sentinel: empty path. */
  public get path(): string {
    return "";
  }

  /** The root has no own value. */
  public get value(): string | undefined {
    return undefined;
  }

  public set value(_value: string) {
    throw new TypeError("the configuration root has no value");
  }

  /** The providers backing this root, in registration order. */
  public get providers(): Iterable<IConfigurationProvider> {
    return this.#providers;
  }

  /**
   * Reads `key`, checking providers in REVERSE (last-registered first) and
   * returning the first hit -- so the last source to define a key wins,
   * resolved lazily per lookup. Returns `undefined` if no provider has it.
   */
  #rawGet(key: string): string | undefined {
    for (let i = this.#providers.length - 1; i >= 0; i--) {
      const result = (this.#providers[i] as IConfigurationProvider).tryGet(key);
      if (result[0]) {
        return result[1];
      }
    }
    return undefined;
  }

  public get(path: string): string | undefined;
  public get<T>(path: string, factory: (value: string) => T): T | undefined;
  public get<T>(path: string, factory?: (value: string) => T): (string | T) | undefined {
    const raw = this.#rawGet(path);
    if (raw === undefined) {
      return undefined;
    }
    return factory === undefined ? raw : factory(raw);
  }

  public getNum(path: string): number | undefined;
  public getNum(path: string, dflt: number): number;
  public getNum(path: string, dflt?: number): number | undefined {
    const raw = this.#rawGet(path);
    if (raw === undefined) {
      return dflt;
    }
    const r = parseNumber(raw);
    if (!r.ok) {
      throw new TypeError(`configuration key "${path}" is ${r.reason}`);
    }
    return r.value;
  }

  public getBool(path: string): boolean | undefined;
  public getBool(path: string, dflt: boolean): boolean;
  public getBool(path: string, dflt?: boolean): boolean | undefined {
    const raw = this.#rawGet(path);
    if (raw === undefined) {
      return dflt;
    }
    const r = parseBoolean(raw);
    if (!r.ok) {
      throw new TypeError(`configuration key "${path}" is ${r.reason}`);
    }
    return r.value;
  }

  /**
   * Writes `key` to EVERY provider, forward order. Throws if there are no
   * providers -- there is nowhere to store the value.
   */
  public set(key: string, value: string): this {
    if (this.#providers.length === 0) {
      throw new Error("Cannot set configuration value: no configuration sources are registered.");
    }
    for (const provider of this.#providers) {
      provider.set(key, value);
    }
    return this;
  }

  /** Always returns a section view for `key` -- never null, no existence check. */
  public getSection(key: string): IConfigurationSection {
    return new ConfigurationSection(this, key);
  }

  /** The immediate top-level sections of this root. */
  public getChildren(): Iterable<IConfigurationSection> {
    return this.getChildrenImplementation(undefined);
  }

  /** The whole tree as a nested plain string object. */
  public toObject(): DeepRecord {
    return subtreeToObject(this);
  }

  /** Forces every provider to reload its source, forward order. */
  public reload(): void {
    for (const provider of this.#providers) {
      provider.load();
    }
  }

  /**
   * Shared child-enumeration for the root and its sections. Folds each
   * provider's `getChildKeys` forward (so the last provider sorts the whole
   * accumulated list), dedups ordinal-ignore-case keeping first occurrence
   * (dedup is the ROOT's job, not the provider's), then maps to sections.
   */
  public getChildrenImplementation(path: string | undefined): IConfigurationSection[] {
    let keys: Iterable<string> = [];
    for (const provider of this.#providers) {
      keys = provider.getChildKeys(keys, path);
    }

    const seen = new Set<string>();
    const distinct: string[] = [];
    for (const key of keys) {
      const folded = key.toLowerCase();
      if (!seen.has(folded)) {
        seen.add(folded);
        distinct.push(key);
      }
    }

    return distinct.map((key) => this.getSection(path === undefined ? key : combine(path, key)));
  }

  protected _getIndex(key: PropertyKey): IndexedSection {
    if (typeof key !== "string") {
      return undefined as unknown as IndexedSection;
    }
    if (key === "then") {
      return undefined as unknown as IndexedSection;
    }
    return this.getSection(key) as unknown as IndexedSection;
  }

  protected _setIndex(_key: PropertyKey, _value: IndexedSection): IndexedSection {
    throw new TypeError(
      "Configuration is read-only through index access; use set(key, value) or the value setter.",
    );
  }
}

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
// the reserved-name hazard (real members shadow the indexer).
//
// Child enumeration lives in the internal InternalConfigurationRootExtensions
// helper (see internal-configuration-root-augmentations.ts), shared with the
// manager and the sections -- mirroring the reference split.

import type {
  ConfigObject,
  IConfigurationProvider,
  IConfigurationRoot,
  IConfigurationSection,
  IndexedSection,
} from "@rhombus-std/config.core";
import { ChangeToken, type IChangeToken } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { IndexAccessed } from "@rhombus-toolkit/proxy-base";
import { parseBoolean, parseNumber } from "./coerce";
import { ConfigurationSection, subtreeToObject } from "./configuration-section";
import { ConfigurationReloadToken } from "./ConfigurationReloadToken";
import { InternalConfigurationRootExtensions } from "./internal-configuration-root-augmentations";

export class ConfigurationRoot extends IndexAccessed<IndexedSection> implements IConfigurationRoot, Disposable {
  readonly #providers: IConfigurationProvider[];
  readonly #changeTokenRegistrations: Disposable[] = [];
  #changeToken = new ConfigurationReloadToken();

  /**
   * Stores `providers` in registration order and eagerly loads each, forward
   * order, so the root reflects every source's data immediately after
   * construction -- then subscribes to each provider's reload token, so a
   * provider-driven reload (not just {@link reload}) also raises the root's
   * own token.
   */
  public constructor(providers: Iterable<IConfigurationProvider>) {
    super();
    this.#providers = [...providers];
    for (const provider of this.#providers) {
      provider.load();
      this.#changeTokenRegistrations.push(
        ChangeToken.onChange(() => provider.getReloadToken(), () => this.#raiseChanged()),
      );
    }
  }

  /** A token that fires whenever this root is reloaded, by any provider or {@link reload}. */
  public getReloadToken(): IChangeToken {
    return this.#changeToken;
  }

  /** Fires the current root token and swaps in a fresh one. */
  #raiseChanged(): void {
    const previous = this.#changeToken;
    this.#changeToken = new ConfigurationReloadToken();
    previous.onReload();
  }

  /**
   * The {@link ConfigurationManager} incremental-composition seam: loads and
   * appends a single already-built provider WITHOUT touching the existing ones,
   * mirroring the reference `ConfigurationManager.AddSource`. Only the new
   * provider is `load()`ed, so any prior `set()` state on the existing
   * providers survives -- a whole-list rebuild would discard it. The adopted
   * provider's reload-token registration joins `#changeTokenRegistrations`, so
   * it is released by {@link [Symbol.dispose]} alongside the constructor's --
   * no leak. Intended for intra-package use by ConfigurationManager, not
   * general consumers.
   */
  public adoptProvider(provider: IConfigurationProvider): void {
    provider.load();
    this.#providers.push(provider);
    this.#changeTokenRegistrations.push(
      ChangeToken.onChange(() => provider.getReloadToken(), () => this.#raiseChanged()),
    );
    this.#raiseChanged();
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
      const result = this.#providers[i]!.tryGet(key);
      if (result[0]) {
        return result[1];
      }
    }
    return undefined;
  }

  public get(path: string): string | undefined;
  public get<T>(path: string, factory: Func<[string], T>): T | undefined;
  public get<T>(path: string, factory?: Func<[string], T>): (string | T) | undefined {
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
    return InternalConfigurationRootExtensions.getChildrenImplementation(this, undefined);
  }

  /** The whole tree as a nested plain string object. */
  public toObject(): ConfigObject {
    return subtreeToObject(this);
  }

  /** Forces every provider to reload its source, forward order, then raises this root's token. */
  public reload(): void {
    for (const provider of this.#providers) {
      provider.load();
    }
    this.#raiseChanged();
  }

  /**
   * Unsubscribes every per-provider reload-token registration -- those set up
   * in the constructor and any added later by {@link adoptProvider}; otherwise
   * those callbacks keep the root (and each provider's token) alive for the
   * process lifetime -- then disposes any provider that is
   * itself disposable. Mirrors MEC's `ConfigurationRoot.Dispose`. Safe to call
   * more than once: each registration's own dispose is idempotent.
   */
  public [Symbol.dispose](): void {
    for (const registration of this.#changeTokenRegistrations) {
      registration[Symbol.dispose]();
    }
    for (const provider of this.#providers) {
      (provider as Partial<Disposable>)[Symbol.dispose]?.();
    }
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

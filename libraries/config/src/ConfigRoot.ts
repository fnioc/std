// ConfigRoot — the provider-list engine, presented as the empty-path section
// at the top of the tree. Reads resolve last-registered-wins (providers are
// checked in reverse per lookup); writes fan out to every provider.

import type { ConfigObject, IConfigProvider, IConfigRoot, IConfigSection,
  IndexedSection } from '@rhombus-std/config.core';
import { ChangeToken, type IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { IndexAccessed } from '@rhombus-toolkit/proxy-base';
import { parseBoolean, parseNumber } from './coerce';
import { ConfigReloadToken } from './ConfigReloadToken';
import { ConfigSection, subtreeToObject } from './ConfigSection';
import { InternalConfigRootExtensions } from './InternalConfigRootExtensions';

export class ConfigRoot extends IndexAccessed<IndexedSection> implements IConfigRoot, Disposable {
  readonly #providers: IConfigProvider[];
  readonly #changeTokenRegistrations: Disposable[] = [];
  #changeToken = new ConfigReloadToken();

  /**
   * Eagerly loads every provider, so the root reflects their data immediately,
   * and subscribes to each provider's reload token so a provider-driven reload
   * raises this root's own token.
   */
  public constructor(providers: Iterable<IConfigProvider>) {
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

  #raiseChanged(): void {
    const previous = this.#changeToken;
    this.#changeToken = new ConfigReloadToken();
    previous.onReload();
  }

  /**
   * Loads and appends one already-built provider without touching the existing
   * ones, so any prior {@link set} state on them survives. An intra-package seam
   * for {@link ConfigManager}'s incremental composition, not for general use.
   */
  public adoptProvider(provider: IConfigProvider): void {
    provider.load();
    this.#providers.push(provider);
    this.#changeTokenRegistrations.push(
      ChangeToken.onChange(() => provider.getReloadToken(), () => this.#raiseChanged()),
    );
    this.#raiseChanged();
  }

  /** The root sentinel: empty key. */
  public get key(): string {
    return '';
  }

  /** The root sentinel: empty path. */
  public get path(): string {
    return '';
  }

  /** The root has no own value. */
  public get value(): string | undefined {
    return undefined;
  }

  public set value(_value: string) {
    throw new TypeError('the configuration root has no value');
  }

  /** The providers backing this root, in registration order. */
  public get providers(): Iterable<IConfigProvider> {
    return this.#providers;
  }

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

  /** Writes `key` into every provider. */
  public set(key: string, value: string): this {
    if (this.#providers.length === 0) {
      throw new Error('Cannot set configuration value: no configuration sources are registered.');
    }
    for (const provider of this.#providers) {
      provider.set(key, value);
    }
    return this;
  }

  /** Always returns a section view for `key`, never null. */
  public getSection(key: string): IConfigSection {
    return new ConfigSection(this, key);
  }

  /** The immediate top-level sections of this root. */
  public getChildren(): Iterable<IConfigSection> {
    return InternalConfigRootExtensions.getChildrenImplementation(this, undefined);
  }

  /** The whole tree as a nested plain string object. */
  public toObject(): ConfigObject {
    return subtreeToObject(this);
  }

  /** Reloads every provider from its source, then raises this root's token. */
  public reload(): void {
    for (const provider of this.#providers) {
      provider.load();
    }
    this.#raiseChanged();
  }

  /**
   * Releases every per-provider reload subscription and disposes any provider
   * that is itself disposable. Safe to call more than once.
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
    if (typeof key !== 'string') {
      return undefined as unknown as IndexedSection;
    }
    if (key === 'then') {
      return undefined as unknown as IndexedSection;
    }
    return this.getSection(key) as unknown as IndexedSection;
  }

  protected _setIndex(_key: PropertyKey, _value: IndexedSection): IndexedSection {
    throw new TypeError('Configuration is read-only through index access; use set(key, value) or the value setter.');
  }
}

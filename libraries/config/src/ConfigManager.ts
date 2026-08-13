import type { ConfigObject, IConfigBuilder, IConfigManager, IConfigProvider, IConfigRoot, IConfigSection,
  IConfigSource } from '@rhombus-std/config.core';
import { augment, ChangeToken, type IChangeToken } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { ConfigReloadToken } from './ConfigReloadToken';
import { ConfigRoot } from './ConfigRoot';
import { getChildrenImplementation } from './internal-children';
import { MemoryConfigSource } from './memory/MemoryConfigSource';

/**
 * A mutable configuration object that is both an {@link IConfigBuilder} and an
 * {@link IConfig}: adding a source immediately builds and presents its values,
 * with no separate "build then read" phase the way {@link ConfigBuilder} has.
 * It starts with one empty in-memory source already registered, so {@link set}
 * works immediately, before any other source is added.
 *
 * @remarks
 * Because it is an {@link IConfigBuilder}, every provider package's `add*` sugar
 * (`addJsonFile`, `addEnvironmentVariables`, ...) is callable on a manager just
 * as on a {@link ConfigBuilder}.
 */
export interface ConfigManager extends IConfigManager, IConfigRoot {}

@augment(typefor<IConfigBuilder>())
export class ConfigManager {
  readonly #sources: IConfigSource[] = [];
  readonly #properties = new Map<string, unknown>();
  readonly #root: ConfigRoot = new ConfigRoot([]);
  #changeToken = new ConfigReloadToken();

  /**
   * The key/value bag shared between this builder and its registered sources
   * ({@link IConfigBuilder.properties}). A source reads it as of its own
   * {@link IConfigSource.build} time.
   */
  public get properties(): Map<string, unknown> {
    return this.#properties;
  }

  /**
   * Seeds one empty {@link MemoryConfigSource} as the first (lowest-precedence)
   * source, so {@link set} has somewhere to write and it never shadows anything
   * added later.
   */
  public constructor() {
    ChangeToken.onChange(() => this.#root.getReloadToken(), () => this.#raiseChanged());
    this.add(new MemoryConfigSource());
  }

  /** The registered sources, in registration order. */
  public get sources(): readonly IConfigSource[] {
    return this.#sources;
  }

  /**
   * Registers a source and appends its provider to the live view; the existing
   * providers — and any {@link set} state on them — are left untouched.
   */
  public add(source: IConfigSource): this {
    this.#sources.push(source);
    this.#root.adoptProvider(source.build(this));
    return this;
  }

  /** Returns the manager itself — it already is the live root. */
  public build(): IConfigRoot {
    return this;
  }

  #raiseChanged(): void {
    const previous = this.#changeToken;
    this.#changeToken = new ConfigReloadToken();
    previous.onReload();
  }

  /** The root node's value; the manager has no value of its own. */
  public get value(): string | undefined {
    return this.#root.value;
  }

  public get(path: string): string | undefined;
  public get<T>(path: string, factory: Func<[string], T>): T | undefined;
  public get<T>(path: string, factory?: Func<[string], T>): (string | T) | undefined {
    return factory === undefined ? this.#root.get(path) : this.#root.get(path, factory);
  }

  public getNum(path: string): number | undefined;
  public getNum(path: string, dflt: number): number;
  public getNum(path: string, dflt?: number): number | undefined {
    return dflt === undefined ? this.#root.getNum(path) : this.#root.getNum(path, dflt);
  }

  public getBool(path: string): boolean | undefined;
  public getBool(path: string, dflt: boolean): boolean;
  public getBool(path: string, dflt?: boolean): boolean | undefined {
    return dflt === undefined ? this.#root.getBool(path) : this.#root.getBool(path, dflt);
  }

  /** Writes `key` into every current provider. */
  public set(key: string, value: string): this {
    this.#root.set(key, value);
    return this;
  }

  public getSection(key: string): IConfigSection {
    return this.#root.getSection(key);
  }

  public getChildren(): Iterable<IConfigSection> {
    return getChildrenImplementation(this, undefined);
  }

  public toObject(): ConfigObject {
    return this.#root.toObject();
  }

  /** A token stable across rebuilds, so a subscriber registered before a later {@link add} still fires. */
  public getReloadToken(): IChangeToken {
    return this.#changeToken;
  }

  /** Forces every current provider to reload its source, then raises the manager's token. */
  public reload(): void {
    this.#root.reload();
  }

  /** The providers backing the current root, in registration order. */
  public get providers(): Iterable<IConfigProvider> {
    return this.#root.providers;
  }
}

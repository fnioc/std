// ConfigurationManager -- the concrete IConfigurationManager. Lives in the
// engine package (not config.core, which only holds the interface) alongside
// ConfigurationBuilder/-Root -- mirrors the reference layout, which ships
// ConfigurationManager beside ConfigurationBuilder/-Root in the Configuration
// package rather than in Hosting.
//
// A mutable, build-as-you-add configuration object: it is simultaneously an
// IConfigurationBuilder (sources/add/build) and an IConfiguration (the read/
// write surface) -- unlike ConfigurationBuilder<T>, which only builds, a
// ConfigurationManager IS the live view. Every add() folds the new source
// into a freshly rebuilt ConfigurationRoot and every IConfiguration method
// delegates to whichever root is current.
//
// Rebuild strategy: add() rebuilds the WHOLE provider list from #sources
// (source.build(this) for every registered source, forward order) rather
// than porting the reference's ReferenceCountedProviders copy-on-write
// optimization -- there is no concurrent-reader/single-writer story to
// preserve in a single-threaded runtime, so the simple rebuild is the
// correct-for-here shape, not a shortcut.
//
// Reload-token continuity across rebuilds: the manager owns a STABLE
// ConfigurationReloadToken (distinct from whichever ConfigurationRoot is
// current) and re-subscribes to the current root's token on every rebuild,
// so a subscriber registered via getReloadToken() before a later add() still
// observes it -- the reference gets this for free because ConfigurationManager
// itself implements IConfigurationRoot and never swaps identity; here the
// stable manager-level token stands in for that.

import type {
  ConfigObject,
  IConfigurationManager,
  IConfigurationProvider,
  IConfigurationRoot,
  IConfigurationSection,
  IConfigurationSource,
} from "@rhombus-std/config.core";
import type { IChangeToken } from "@rhombus-std/primitives";
import { ChangeToken } from "@rhombus-std/primitives";
import { ConfigurationReloadToken } from "./configuration-reload-token";
import { ConfigurationRoot } from "./configuration-root";

/**
 * A mutable configuration object: both an {@link IConfigurationBuilder} and
 * an {@link IConfiguration}. As sources are added, it immediately rebuilds
 * and re-presents its current view -- there is no separate "build then read"
 * phase the way there is with {@link ConfigurationBuilder}.
 */
export class ConfigurationManager implements IConfigurationManager, IConfigurationRoot {
  readonly #sources: IConfigurationSource[] = [];
  #root: ConfigurationRoot = new ConfigurationRoot([]);
  #rootTokenRegistration: Disposable | undefined;
  #changeToken = new ConfigurationReloadToken();

  /** The registered sources, in registration order. */
  public get sources(): readonly IConfigurationSource[] {
    return this.#sources;
  }

  /**
   * Registers a configuration source and immediately rebuilds the current
   * view over every registered source's provider (forward order, last wins
   * on read). Returns `this` for chaining.
   */
  public add(source: IConfigurationSource): this {
    this.#sources.push(source);
    this.#rebuild();
    return this;
  }

  /** Returns this manager's current root view -- itself, since the manager IS the live root. */
  public build(): IConfigurationRoot {
    return this;
  }

  /** Rebuilds every provider from #sources and re-wires reload-token propagation. */
  #rebuild(): void {
    const providers: IConfigurationProvider[] = this.#sources.map((source) => source.build(this));
    this.#rootTokenRegistration?.[Symbol.dispose]();
    this.#root = new ConfigurationRoot(providers);
    this.#rootTokenRegistration = ChangeToken.onChange(
      () => this.#root.getReloadToken(),
      () => this.#raiseChanged(),
    );
    this.#raiseChanged();
  }

  /** Fires the manager's current token and swaps in a fresh one. */
  #raiseChanged(): void {
    const previous = this.#changeToken;
    this.#changeToken = new ConfigurationReloadToken();
    previous.onReload();
  }

  /** The manager has no own value -- it presents the root of the tree. */
  public get value(): string | undefined {
    return this.#root.value;
  }

  public get(path: string): string | undefined;
  public get<T>(path: string, factory: (value: string) => T): T | undefined;
  public get<T>(path: string, factory?: (value: string) => T): (string | T) | undefined {
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

  /** Writes `key` to every current provider -- delegates to the current root. */
  public set(key: string, value: string): this {
    this.#root.set(key, value);
    return this;
  }

  public getSection(key: string): IConfigurationSection {
    return this.#root.getSection(key);
  }

  public getChildren(): Iterable<IConfigurationSection> {
    return this.#root.getChildren();
  }

  public toObject(): ConfigObject {
    return this.#root.toObject();
  }

  /** A token stable across rebuilds -- see the class doc comment for why this can't just delegate. */
  public getReloadToken(): IChangeToken {
    return this.#changeToken;
  }

  /** Forces every current provider to reload its source, then raises the manager's token. */
  public reload(): void {
    this.#root.reload();
  }

  /** The providers backing the current root, in registration order. */
  public get providers(): Iterable<IConfigurationProvider> {
    return this.#root.providers;
  }
}

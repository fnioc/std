// ConfigManager -- the concrete IConfigManager. Lives in the
// engine package (not config.core, which only holds the interface) alongside
// ConfigBuilder/-Root -- mirrors the reference layout, which ships
// ConfigManager beside ConfigBuilder/-Root in the Configuration
// package rather than in Hosting.
//
// A mutable, build-as-you-add configuration object: it is simultaneously an
// IConfigBuilder (sources/add/build) and an IConfig (the read/
// write surface) -- unlike ConfigBuilder<T>, which only builds, a
// ConfigManager IS the live view. It holds ONE persistent
// ConfigRoot and every IConfig method delegates to it.
//
// Incremental composition: add() builds+loads ONLY the new source's provider
// and APPENDS it to the persistent root (via ConfigRoot.adoptProvider),
// never rebuilding or reloading the existing providers -- mirrors the
// reference `ConfigManager.AddSource`. This is load-bearing for
// correctness, not just efficiency: a provider's set() state lives in the
// provider instance, so a whole-list rebuild would silently discard any prior
// manager.set() on the next add(). The reference's ReferenceCountedProviders
// copy-on-write manager is not ported -- there is no concurrent-reader story
// to preserve in a single-threaded runtime.
//
// Reload-token continuity: the manager owns a STABLE ConfigReloadToken
// (distinct from the root's own token) and subscribes ONCE to the root's token
// -- which the root swaps on every raise, so ChangeToken.onChange re-subscribes
// automatically. A subscriber registered via getReloadToken() before a later
// add() still observes it: the reference gets this for free because
// ConfigManager itself implements IConfigRoot and never swaps
// identity; here the stable manager-level token stands in for that.

import type { ConfigObject, IConfigBuilder, IConfigManager, IConfigProvider, IConfigRoot, IConfigSection,
  IConfigSource } from '@rhombus-std/config.core';
import { augment, ChangeToken, type IChangeToken } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { ConfigReloadToken } from './ConfigReloadToken';
import { ConfigRoot } from './ConfigRoot';
import { InternalConfigRootExtensions } from './InternalConfigRootExtensions';
import { MemoryConfigSource } from './memory/MemoryConfigSource';

/**
 * A mutable configuration object: both an {@link IConfigBuilder} and
 * an {@link IConfig}. As sources are added, it immediately rebuilds
 * and re-presents its current view -- there is no separate "build then read"
 * phase the way there is with {@link ConfigBuilder}. Starts with one
 * empty in-memory source already registered (see the constructor), so
 * {@link set} works immediately, before any other source is ever added.
 *
 * ConfigManager IS an IConfigBuilder too, so `@augment` gives it
 * the same OPEN-receiver decoration as ConfigBuilder -- every provider
 * package's add* sugar (addJsonFile, addEnvironmentVariables,
 * addConfig, ...) reaches `manager.` exactly as it reaches `builder.`
 * (docs/decisions.md §38).
 */
@augment(tokenfor<IConfigBuilder>())
export class ConfigManager implements IConfigManager, IConfigRoot {
  readonly #sources: IConfigSource[] = [];
  readonly #properties = new Map<string, unknown>();
  readonly #root: ConfigRoot = new ConfigRoot([]);
  #changeToken = new ConfigReloadToken();

  /**
   * The shared key/value bag between this builder and its registered sources
   * ({@link IConfigBuilder.properties}). DIVERGENCE: the reference
   * manager wraps its bag so that ANY mutation triggers a full
   * rebuild-all-sources pass (its `ReloadSources`); this port's manager
   * composes providers incrementally and has no rebuild-everything path (see
   * the class doc -- a rebuild would discard provider `set()` state), so the
   * bag is a plain shared Map and a source observes `properties` as of its
   * own {@link IConfigSource.build} time.
   */
  public get properties(): Map<string, unknown> {
    return this.#properties;
  }

  /**
   * Subscribes the manager's stable token to the persistent root's token. The
   * root swaps its own token on every raise, so `ChangeToken.onChange`
   * re-subscribes automatically -- the manager therefore observes every raise
   * from any provider appended later via {@link add}. Then seeds one empty
   * {@link MemoryConfigSource} through THAT SAME {@link add} path --
   * mirroring the reference constructor, which starts with one memory source
   * so there's somewhere to write before a real source exists. It's the
   * first (lowest-precedence) source registered, so it never shadows
   * anything added afterward.
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
   * Registers a configuration source, then builds+loads ONLY its provider and
   * appends it to the persistent root -- the existing providers (and any
   * {@link set} state on them) are left untouched. Returns `this` for chaining.
   */
  public add(source: IConfigSource): this {
    this.#sources.push(source);
    this.#root.adoptProvider(source.build(this));
    return this;
  }

  /** Returns this manager's root view -- itself, since the manager IS the live root. */
  public build(): IConfigRoot {
    return this;
  }

  /** Fires the manager's current token and swaps in a fresh one. */
  #raiseChanged(): void {
    const previous = this.#changeToken;
    this.#changeToken = new ConfigReloadToken();
    previous.onReload();
  }

  /** The manager has no own value -- it presents the root of the tree. */
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

  /** Writes `key` to every current provider -- delegates to the current root. */
  public set(key: string, value: string): this {
    this.#root.set(key, value);
    return this;
  }

  public getSection(key: string): IConfigSection {
    return this.#root.getSection(key);
  }

  /**
   * Enumerates children with the MANAGER itself as the receiver -- mirroring
   * the reference manager, which calls the internal helper on `this` rather
   * than delegating -- though every member the helper touches (`providers`,
   * `getSection`) delegates to the persistent root anyway.
   */
  public getChildren(): Iterable<IConfigSection> {
    return InternalConfigRootExtensions.getChildrenImplementation(this, undefined);
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
  public get providers(): Iterable<IConfigProvider> {
    return this.#root.providers;
  }
}

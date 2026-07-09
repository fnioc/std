// ConfigurationManager -- the concrete IConfigurationManager. Lives in the
// engine package (not config.core, which only holds the interface) alongside
// ConfigurationBuilder/-Root -- mirrors the reference layout, which ships
// ConfigurationManager beside ConfigurationBuilder/-Root in the Configuration
// package rather than in Hosting.
//
// A mutable, build-as-you-add configuration object: it is simultaneously an
// IConfigurationBuilder (sources/add/build) and an IConfiguration (the read/
// write surface) -- unlike ConfigurationBuilder<T>, which only builds, a
// ConfigurationManager IS the live view. It holds ONE persistent
// ConfigurationRoot and every IConfiguration method delegates to it.
//
// Incremental composition: add() builds+loads ONLY the new source's provider
// and APPENDS it to the persistent root (via ConfigurationRoot.adoptProvider),
// never rebuilding or reloading the existing providers -- mirrors the
// reference `ConfigurationManager.AddSource`. This is load-bearing for
// correctness, not just efficiency: a provider's set() state lives in the
// provider instance, so a whole-list rebuild would silently discard any prior
// manager.set() on the next add(). The reference's ReferenceCountedProviders
// copy-on-write manager is not ported -- there is no concurrent-reader story
// to preserve in a single-threaded runtime.
//
// Reload-token continuity: the manager owns a STABLE ConfigurationReloadToken
// (distinct from the root's own token) and subscribes ONCE to the root's token
// -- which the root swaps on every raise, so ChangeToken.onChange re-subscribes
// automatically. A subscriber registered via getReloadToken() before a later
// add() still observes it: the reference gets this for free because
// ConfigurationManager itself implements IConfigurationRoot and never swaps
// identity; here the stable manager-level token stands in for that.

import { CONFIGURATION_BUILDER_AUGMENTATION_TOKEN } from "@rhombus-std/config.core";
import type {
  ConfigObject,
  IConfigurationManager,
  IConfigurationProvider,
  IConfigurationRoot,
  IConfigurationSection,
  IConfigurationSource,
} from "@rhombus-std/config.core";
import type { IChangeToken } from "@rhombus-std/primitives";
import { augment, ChangeToken } from "@rhombus-std/primitives";
import { ConfigurationReloadToken } from "./configuration-reload-token";
import { ConfigurationRoot } from "./configuration-root";
import { MemoryConfigurationSource } from "./memory/memory-configuration-source";

/**
 * A mutable configuration object: both an {@link IConfigurationBuilder} and
 * an {@link IConfiguration}. As sources are added, it immediately rebuilds
 * and re-presents its current view -- there is no separate "build then read"
 * phase the way there is with {@link ConfigurationBuilder}. Starts with one
 * empty in-memory source already registered (see the constructor), so
 * {@link set} works immediately, before any other source is ever added.
 *
 * ConfigurationManager IS an IConfigurationBuilder too, so `@augment` gives it
 * the same OPEN-receiver decoration as ConfigurationBuilder -- every provider
 * package's add* sugar (addJsonFile, addEnvironmentVariables,
 * addConfiguration, ...) reaches `manager.` exactly as it reaches `builder.`
 * (docs/decisions.md §38).
 */
@augment(CONFIGURATION_BUILDER_AUGMENTATION_TOKEN)
export class ConfigurationManager implements IConfigurationManager, IConfigurationRoot {
  readonly #sources: IConfigurationSource[] = [];
  readonly #root: ConfigurationRoot = new ConfigurationRoot([]);
  #changeToken = new ConfigurationReloadToken();

  /**
   * Subscribes the manager's stable token to the persistent root's token. The
   * root swaps its own token on every raise, so `ChangeToken.onChange`
   * re-subscribes automatically -- the manager therefore observes every raise
   * from any provider appended later via {@link add}. Then seeds one empty
   * {@link MemoryConfigurationSource} through THAT SAME {@link add} path --
   * mirroring the reference constructor, which starts with one memory source
   * so there's somewhere to write before a real source exists. It's the
   * first (lowest-precedence) source registered, so it never shadows
   * anything added afterward.
   */
  public constructor() {
    ChangeToken.onChange(() => this.#root.getReloadToken(), () => this.#raiseChanged());
    this.add(new MemoryConfigurationSource());
  }

  /** The registered sources, in registration order. */
  public get sources(): readonly IConfigurationSource[] {
    return this.#sources;
  }

  /**
   * Registers a configuration source, then builds+loads ONLY its provider and
   * appends it to the persistent root -- the existing providers (and any
   * {@link set} state on them) are left untouched. Returns `this` for chaining.
   */
  public add(source: IConfigurationSource): this {
    this.#sources.push(source);
    this.#root.adoptProvider(source.build(this));
    return this;
  }

  /** Returns this manager's root view -- itself, since the manager IS the live root. */
  public build(): IConfigurationRoot {
    return this;
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

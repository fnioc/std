// The configuration abstraction types: the IConfiguration* interface family and
// the ITryGetResult tuple type. Pure types -- zero runtime; the one import is
// `IChangeToken`, itself a type-only (zero-runtime) primitive.

import type { IChangeToken } from "@rhombus-std/primitives";

/**
 * A node's subtree as a nested plain string object. A node that has children
 * is a nested record (its own scalar value, if any, is dropped -- see
 * {@link IConfiguration.toObject}); a pure leaf is its string value.
 */
export type DeepRecord = { readonly [key: string]: string | DeepRecord };

/**
 * The index-navigable Section type: an {@link IConfigurationSection} whose
 * unknown string keys resolve to further sections, so `config.Server.Port`
 * dot/bracket navigation type-checks.
 *
 * INLINE self-referential intersection by design -- routing the recursive
 * self-reference through a generic alias trips TS2456 ("Type alias circularly
 * references itself"). Real members (`value`, `get`, `getSection`, ...) win
 * over the index signature; only genuinely-unknown keys resolve to
 * `IndexedSection`. Under `noUncheckedIndexedAccess` the index-access site
 * (`config.Server`) types as `IndexedSection | undefined` -- a conservative
 * false-positive for navigation (runtime always returns a Section for a string
 * key), by design. The typed path without that tax is a runtime schema
 * (`ConfigurationBuilder.withSchema`), whose result has named keys and no
 * index signature.
 */
export type IndexedSection = IConfigurationSection & {
  readonly [key: string]: IndexedSection;
};

/**
 * A set of key/value application configuration properties. Every value is a
 * raw string unless explicitly coerced; navigation always yields a Section and
 * leaf reads always yield the requested scalar type (no accessor returns a
 * string for one input and a section for another).
 */
export interface IConfiguration {
  /** This node's own value (undefined on the root, or when absent). */
  readonly value: string | undefined;

  /** The raw string at a flat colon-delimited path (undefined if absent). */
  get(path: string): string | undefined;

  /** A typed leaf via a caller-supplied factory (undefined if the path is absent). */
  get<T>(path: string, factory: (value: string) => T): T | undefined;

  /**
   * Coerces a leaf to a finite number. Returns `dflt` (or undefined) when the
   * path is absent; THROWS when the path is present but not a finite number.
   */
  getNum(path: string): number | undefined;
  getNum(path: string, dflt: number): number;

  /**
   * Coerces a leaf to a boolean, LIBERAL and case-insensitive (true/1/yes/on
   * -> true, false/0/no/off -> false). Returns `dflt` (or undefined) when
   * absent; THROWS when present but unrecognized.
   */
  getBool(path: string): boolean | undefined;
  getBool(path: string, dflt: boolean): boolean;

  /** Writes a descendant key (index-based writes are not supported). */
  set(key: string, value: string): this;

  /**
   * A sub-section with the specified key. Never returns `null`: a missing key
   * yields an empty {@link IConfigurationSection}.
   */
  getSection(key: string): IConfigurationSection;

  /** The immediate descendant configuration sub-sections. */
  getChildren(): Iterable<IConfigurationSection>;

  /** This node's subtree as a nested plain string object. */
  toObject(): DeepRecord;

  /**
   * A token that fires when this configuration is reloaded -- the root
   * composes its providers' tokens into its own; a section delegates to its
   * root.
   */
  getReloadToken(): IChangeToken;
}
/// <summary>
/// Represents a type used to build application configuration.
/// </summary>
export interface IConfigurationBuilder {
  /// <summary>
  /// Gets a key/value collection that can be used to share data between the <see cref="IConfigurationBuilder"/>
  /// and the registered <see cref="IConfigurationSource"/>s.
  /// </summary>
  // get properties(): Record<string, object>;

  /// <summary>
  /// Gets the sources used to obtain configuration values
  /// </summary>
  get sources(): readonly IConfigurationSource[];

  /// <summary>
  /// Adds a new configuration source.
  /// </summary>
  /// <param name="source">The configuration source to add.</param>
  /// <returns>The same <see cref="IConfigurationBuilder"/>.</returns>
  add(source: IConfigurationSource): IConfigurationBuilder;

  /// <summary>
  /// Builds an <see cref="IConfiguration"/> with keys and values from the set of sources registered in
  /// <see cref="Sources"/>.
  /// </summary>
  /// <returns>An <see cref="IConfigurationRoot"/> with keys and values from the registered sources.</returns>
  build(): IConfigurationRoot;
}
/// <summary>
/// Represents a mutable configuration object.
/// </summary>
/// <remarks>
/// It is both an <see cref="IConfigurationBuilder"/> and an <see cref="IConfiguration"/>.
/// As sources are added, it updates its current view of configuration.
/// </remarks>
export interface IConfigurationManager extends IConfiguration, IConfigurationBuilder {
}
/// <summary>
/// Represents the root of an <see cref="IConfiguration"/> hierarchy.
/// </summary>
export interface IConfigurationRoot extends IConfiguration {
  /// <summary>
  /// Forces the configuration values to be reloaded from the underlying <see cref="IConfigurationProvider"/> providers.
  /// </summary>
  reload(): void;

  /// <summary>
  /// Gets the <see cref="IConfigurationProvider"/> providers for this configuration.
  /// </summary>
  get providers(): Iterable<IConfigurationProvider>;
}
/// <summary>
/// Represents a source of configuration key/values for an application.
/// </summary>
export interface IConfigurationSource {
  /// <summary>
  /// Builds the <see cref="IConfigurationProvider"/> for this source.
  /// </summary>
  /// <param name="builder">The <see cref="IConfigurationBuilder"/>.</param>
  /// <returns>An <see cref="IConfigurationProvider"/></returns>
  build(builder: IConfigurationBuilder): IConfigurationProvider;
}
export type ITryGetResult<T> = [success: false] | [success: true, value: T];
/// <summary>
/// Provides configuration key/values for an application.
/// </summary>
export interface IConfigurationProvider {
  /// <summary>
  /// Tries to get a configuration value for the specified key.
  /// </summary>
  /// <param name="key">The key.</param>
  /// <param name="value">When this method returns, contains the value for the specified key.</param>
  /// <returns><see langword="true" /> if a value for the specified key was found, otherwise <see langword="false" />.</returns>
  tryGet(key: string): ITryGetResult<string>;

  /// <summary>
  /// Sets a configuration value for the specified key.
  /// </summary>
  /// <param name="key">The key.</param>
  /// <param name="value">The value.</param>
  set(key: string, value?: string): void;

  /// <summary>
  /// Attempts to get an <see cref="IChangeToken"/> for change tracking.
  /// </summary>
  /// <returns>An <see cref="IChangeToken"/> token if this provider supports change tracking, <see langword="null"/> otherwise.</returns>
  getReloadToken(): IChangeToken;

  /// <summary>
  /// Loads configuration values from the source represented by this <see cref="IConfigurationProvider"/>.
  /// </summary>
  load(): void;

  /// <summary>
  /// Returns the immediate descendant configuration keys for a given parent path based on the data of this
  /// <see cref="IConfigurationProvider"/> and the set of keys returned by all the preceding
  /// <see cref="IConfigurationProvider"/> providers.
  /// </summary>
  /// <param name="earlierKeys">The child keys returned by the preceding providers for the same parent path.</param>
  /// <param name="parentPath">The parent path.</param>
  /// <returns>The child keys.</returns>
  getChildKeys(earlierKeys: Iterable<string>, parentPath?: string): Iterable<string>;
}

/// <summary>
/// Represents a section of application configuration values.
/// </summary>
export interface IConfigurationSection extends IConfiguration {
  /// <summary>
  /// Gets the key this section occupies in its parent.
  /// </summary>
  get key(): string;

  /// <summary>
  /// Gets the full path to this section within the <see cref="IConfiguration"/>.
  /// </summary>
  get path(): string;

  /// <summary>
  /// Gets or sets the section value.
  /// </summary>
  get value(): string | undefined;
  set value(value: string);
}

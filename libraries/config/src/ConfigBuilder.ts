// ConfigBuilder<T> -- the single injection point for typed configuration.
//
// Ships with ONLY add(source) + withSchema(schema) + build() -- no
// addJsonFile/addEnvironmentVariables/etc. baked in. Each provider package (and
// the in-package Memory/Chained providers) bolts its own add* sugar on via TS
// declaration merging + an augmentation registered against the shared
// IConfigBuilder token (docs/decisions.md §38); this class is decorated
// for that token at the bottom of the file. add* return `this` so those
// augmentations type-check without a cast and preserve `T` through the fluent
// chain.
//
// The generic `T` is the type build() returns:
//   - default `IndexedSection` (Tier 0) -- the proxy-wrapped root, untyped tree.
//   - `Infer<S>` after withSchema(S) (Tier 1) -- a fully-coerced plain object.
// build() is the ONE place coercion happens, driven by the runtime schema
// recorded by withSchema, so it is immune to call-site rewriting and dynamic
// paths.
//
// This class deliberately does NOT `implements IConfigBuilder`: its
// `build(): T` (T can be a POJO) is not assignable to the interface's
// `build(): IConfigRoot`. The generic lives only on this concrete class;
// consumers program against the class for the typed path. Sources still expect
// an IConfigBuilder, so `this` is cast at the one call site.

import type { IConfigBuilder, IConfigProvider, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { coerceBySchema } from './coerce';
import { ConfigRoot } from './ConfigRoot';
import type { Infer, ObjectSchema, Schema } from './schema';

/**
 * `@augment` decorates the concrete builder for the OPEN IConfigBuilder
 * receiver: it (re)installs the tokenfor<IConfigBuilder>() bag
 * onto the prototype now and on every later registration, so downstream
 * provider packages' add* sugar reaches it (docs/decisions.md §38).
 */
@augment(tokenfor<IConfigBuilder>())
export class ConfigBuilder<T = IndexedSection> {
  readonly #sources: IConfigSource[] = [];
  readonly #properties = new Map<string, unknown>();
  #schema?: Schema;

  /**
   * The shared key/value bag between this builder and its registered sources
   * ({@link IConfigBuilder.properties}): a source can read a
   * builder-wide setting from it during {@link IConfigSource.build}.
   * One mutable Map instance for the builder's lifetime.
   */
  public get properties(): Map<string, unknown> {
    return this.#properties;
  }

  /**
   * The registered sources, in registration order. Ordered-list semantics --
   * the same source instance can be registered more than once (no reference
   * dedup) -- so this is a readonly array view, not the mutable backing
   * store; register sources through {@link add}.
   */
  public get sources(): readonly IConfigSource[] {
    return this.#sources;
  }

  /** Registers a configuration source. Returns `this` for chaining. */
  public add(source: IConfigSource): this {
    this.#sources.push(source);
    return this;
  }

  /**
   * Records a runtime schema and re-types the builder so `build()` returns the
   * inferred, fully-coerced object shape `Infer<S>`. The `const` type parameter
   * preserves the schema literal without the caller writing `as const`.
   * `S extends ObjectSchema` forbids a bare-leaf top-level schema.
   */
  public withSchema<const S extends ObjectSchema>(schema: S): ConfigBuilder<Infer<S>> {
    this.#schema = schema;
    return this as unknown as ConfigBuilder<Infer<S>>;
  }

  /**
   * Builds each registered source into a provider (registration order),
   * constructs a {@link ConfigRoot} over them, and -- if a schema was
   * recorded via {@link withSchema} -- coerces the root into the typed object
   * (throwing {@link SchemaCoercionError} on any missing-required or invalid
   * leaf). Without a schema, returns the proxy-wrapped root as `IndexedSection`.
   */
  public build(): T {
    const providers: IConfigProvider[] = [];
    for (const source of this.#sources) {
      providers.push(source.build(this as unknown as IConfigBuilder));
    }
    const root = new ConfigRoot(providers);
    if (this.#schema !== undefined) {
      return coerceBySchema(root, this.#schema) as T;
    }
    return root as unknown as T;
  }
}

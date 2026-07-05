// ConfigurationBuilder<T> -- the single injection point for typed configuration.
//
// Ships with ONLY add(source) + withSchema(schema) + build() -- no
// addJsonFile/addEnvironmentVariables/etc. baked in. Each provider package (and
// the in-package Memory provider) bolts its own add* sugar on via TS
// declaration merging + a runtime prototype assignment, mimicking an extension
// method. add* return `this` so those augmentations type-check without a cast
// and preserve `T` through the fluent chain.
//
// The generic `T` is the type build() returns:
//   - default `IndexedSection` (Tier 0) -- the proxy-wrapped root, untyped tree.
//   - `Infer<S>` after withSchema(S) (Tier 1) -- a fully-coerced plain object.
// build() is the ONE place coercion happens, driven by the runtime schema
// recorded by withSchema, so it is immune to call-site rewriting and dynamic
// paths.
//
// This class deliberately does NOT `implements IConfigurationBuilder`: its
// `build(): T` (T can be a POJO) is not assignable to the interface's
// `build(): IConfigurationRoot`. The generic lives only on this concrete class;
// consumers program against the class for the typed path. Sources still expect
// an IConfigurationBuilder, so `this` is cast at the one call site.

import type {
  IConfigurationBuilder,
  IConfigurationProvider,
  IConfigurationSource,
  IndexedSection,
} from "@rhombus-std/config.core";
import { coerceBySchema } from "./coerce";
import { ConfigurationRoot } from "./configuration-root";
import type { Infer, ObjectSchema, Schema } from "./schema";

export class ConfigurationBuilder<T = IndexedSection> {
  readonly #sources = new Set<IConfigurationSource>();
  #schema?: Schema;

  /** The registered sources, in registration (insertion) order. */
  public get sources(): Set<IConfigurationSource> {
    return this.#sources;
  }

  /** Registers a configuration source. Returns `this` for chaining. */
  public add(source: IConfigurationSource): this {
    this.#sources.add(source);
    return this;
  }

  /**
   * Records a runtime schema and re-types the builder so `build()` returns the
   * inferred, fully-coerced object shape `Infer<S>`. The `const` type parameter
   * preserves the schema literal without the caller writing `as const`.
   * `S extends ObjectSchema` forbids a bare-leaf top-level schema.
   */
  public withSchema<const S extends ObjectSchema>(schema: S): ConfigurationBuilder<Infer<S>> {
    this.#schema = schema;
    return this as unknown as ConfigurationBuilder<Infer<S>>;
  }

  /**
   * Builds each registered source into a provider (registration order),
   * constructs a {@link ConfigurationRoot} over them, and -- if a schema was
   * recorded via {@link withSchema} -- coerces the root into the typed object
   * (throwing {@link SchemaCoercionError} on any missing-required or invalid
   * leaf). Without a schema, returns the proxy-wrapped root as `IndexedSection`.
   */
  public build(): T {
    const providers: IConfigurationProvider[] = [];
    for (const source of this.#sources) {
      providers.push(source.build(this as unknown as IConfigurationBuilder));
    }
    const root = new ConfigurationRoot(providers);
    if (this.#schema !== undefined) {
      return coerceBySchema(root, this.#schema) as T;
    }
    return root as unknown as T;
  }
}

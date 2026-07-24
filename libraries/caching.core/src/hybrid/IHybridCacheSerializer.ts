/** Provides per-type serialization and deserialization support for a `HybridCache`. */
export interface IHybridCacheSerializer<T> {
  /** Deserializes a `T` value from the provided `source` payload. */
  deserialize(source: Uint8Array): T;

  /** Serializes `value`, returning the serialized payload. */
  serialize(value: T): Uint8Array;
}

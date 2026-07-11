// IHybridCacheSerializer -- ported from ME.Caching.Abstractions'
// Hybrid/IHybridCacheSerializer{T}.
//
// Platform adaptation from the reference: both signatures there are shaped by
// pooled-buffer economics -- `Deserialize` reads a `ReadOnlySequence<byte>` (a
// possibly multi-segment view over pooled buffers) and `Serialize` writes into
// a caller-supplied `IBufferWriter<byte>` (a pooled write target), so payloads
// never materialize as collectable arrays. This runtime has no buffer pooling
// to serve (the same call as skipping the reference's buffer-writer overlay on
// the distributed cache), so both collapse to the family's plain `Uint8Array`
// payload vocabulary: `deserialize` takes one contiguous buffer, `serialize`
// returns one.

/** Provides per-type serialization and deserialization support for a `HybridCache`. */
export interface IHybridCacheSerializer<T> {
  /** Deserializes a `T` value from the provided `source` payload. */
  deserialize(source: Uint8Array): T;

  /** Serializes `value`, returning the serialized payload. */
  serialize(value: T): Uint8Array;
}

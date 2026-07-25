// Abstract base for stream-based configuration sources.
//
// Providers load SYNCHRONOUSLY (`IConfigProvider.load(): void` -- the whole
// engine's build path is sync), and a `ReadableStream` can only be consumed
// asynchronously, so the payload here is already-materialized bytes or text
// (`Uint8Array | string`) rather than @rhombus-std/primitives' structural
// `ReadableStream<R>`.

import type { IConfigBuilder, IConfigProvider, IConfigSource } from '@rhombus-std/config.core';

/**
 * The in-memory payload a {@link StreamConfigSource} reads
 * configuration data from: raw bytes (decoded as UTF-8 by the concrete
 * provider) or already-decoded text.
 */
export type StreamPayload = Uint8Array | string;

/**
 * Defines the core behavior of stream-based configuration sources and
 * provides a base for derived classes.
 */
export abstract class StreamConfigSource implements IConfigSource {
  /**
   * The payload containing the configuration data. May be assigned after
   * construction; {@link StreamConfigProvider}'s `load()` throws if it is
   * still unset.
   */
  public stream: StreamPayload | undefined;

  public constructor(stream?: StreamPayload) {
    this.stream = stream;
  }

  /** Builds the {@link StreamConfigProvider} for this source. */
  public abstract build(builder: IConfigBuilder): IConfigProvider;
}

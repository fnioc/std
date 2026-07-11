// StreamConfigurationSource -- abstract base for stream-based configuration
// sources; mirrors the reference `StreamConfigurationSource`.
//
// Platform adaptation (the reference's byte-stream type): providers load
// SYNCHRONOUSLY (`IConfigurationProvider.load(): void` -- the whole engine's
// build path is sync), and the platform's `ReadableStream` can only be
// consumed asynchronously, so the payload here is the already-materialized
// bytes or text (`Uint8Array | string`) rather than @rhombus-std/primitives'
// structural `ReadableStream<R>`. That matches how the reference type is
// actually used -- an in-memory payload (embedded resource, test fixture)
// wrapped in an in-memory stream -- while keeping `load()` synchronous and
// `addJsonStream` faithful.

import type { IConfigurationBuilder, IConfigurationProvider, IConfigurationSource } from '@rhombus-std/config.core';

/**
 * The in-memory payload a {@link StreamConfigurationSource} reads
 * configuration data from: raw bytes (decoded as UTF-8 by the concrete
 * provider) or already-decoded text.
 */
export type StreamPayload = Uint8Array | string;

/**
 * Defines the core behavior of stream-based configuration sources and
 * provides a base for derived classes.
 */
export abstract class StreamConfigurationSource implements IConfigurationSource {
  /**
   * The payload containing the configuration data. May be assigned after
   * construction (the reference shape); {@link StreamConfigurationProvider}'s
   * `load()` throws if it is still unset.
   */
  public stream: StreamPayload | undefined;

  public constructor(stream?: StreamPayload) {
    this.stream = stream;
  }

  /** Builds the {@link StreamConfigurationProvider} for this source. */
  public abstract build(builder: IConfigurationBuilder): IConfigurationProvider;
}

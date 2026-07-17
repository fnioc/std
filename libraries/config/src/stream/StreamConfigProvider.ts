// StreamConfigProvider -- abstract base for stream-based configuration
// providers; mirrors the reference `StreamConfigProvider`. The
// reference declares BOTH the once-only-guard `Load()` and the abstract
// payload-taking `Load(Stream)` as one overloaded name; TS cannot pair an
// abstract overload with a concrete implementation of the other arity, so the
// payload-taking half is named `loadStream` here.

import { ConfigProvider } from '../ConfigProvider';
import type { StreamConfigSource, StreamPayload } from './StreamConfigSource';

/**
 * Defines the core behavior of stream-based configuration providers and
 * provides a base for derived classes.
 */
export abstract class StreamConfigProvider extends ConfigProvider {
  /** The source settings for this provider. */
  public readonly source: StreamConfigSource;

  #loaded = false;

  public constructor(source: StreamConfigSource) {
    super();
    this.source = source;
  }

  /** Loads the configuration data from `stream`. */
  public abstract loadStream(stream: StreamPayload): void;

  /**
   * Loads the configuration data from the source's stream payload. Throws on
   * subsequent calls -- a stream is consumed exactly once (reference parity),
   * so a root-wide `reload()` over a stream provider throws too.
   */
  public override load(): void {
    if (this.#loaded) {
      throw new Error('StreamConfigProvider: a stream configuration provider cannot be loaded more than once.');
    }
    const stream = this.source.stream;
    if (stream === undefined) {
      throw new Error("StreamConfigProvider: the source's stream payload is unset.");
    }
    this.loadStream(stream);
    this.#loaded = true;
  }
}

// Loads JSON configuration key/value pairs from an in-memory stream
// payload. Same flattening rules as JsonConfigProvider -- both delegate to
// the shared JsonConfigFileParser.

import { StreamConfigProvider, type StreamPayload } from '@rhombus-std/config';
import { JsonConfigFileParser } from './JsonConfigFileParser';
import type { JsonStreamConfigSource } from './JsonStreamConfigSource';

// Structural typing for the platform's UTF-8 decoder global (native in
// node/bun/deno/browsers), local to this module: the zero-ambient-types
// library program has no TextDecoder in scope, and the type never surfaces
// in a public signature, so a module-local lookup beats widening the
// platform surface elsewhere. Through `unknown` because the bare-lib
// `typeof globalThis` genuinely lacks the property.
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new() => Utf8Decoder; };
const utf8Decoder = new TextDecoder();

/** Provides configuration key/value pairs obtained from a JSON stream payload. */
export class JsonStreamConfigProvider extends StreamConfigProvider {
  public constructor(source: JsonStreamConfigSource) {
    super(source);
  }

  /** Parses and flattens the JSON payload into this provider's store. */
  public override loadStream(stream: StreamPayload): void {
    const raw = typeof stream === 'string' ? stream : utf8Decoder.decode(stream);
    for (const [key, value] of JsonConfigFileParser.parse(raw, 'JsonStreamConfigProvider')) {
      this.set(key, value);
    }
  }
}

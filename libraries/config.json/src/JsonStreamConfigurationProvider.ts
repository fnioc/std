// JsonStreamConfigurationProvider -- loads JSON configuration key/value pairs
// from an in-memory stream payload; mirrors the reference
// `JsonStreamConfigurationProvider`. Same flattening rules as
// JsonConfigurationProvider -- both delegate to the shared
// JsonConfigurationFileParser.

import { StreamConfigurationProvider, type StreamPayload } from '@rhombus-std/config';
import { JsonConfigurationFileParser } from './json-configuration-file-parser';
import type { JsonStreamConfigurationSource } from './JsonStreamConfigurationSource';

// Structural typing for the platform's UTF-8 decoder global (native in
// node/bun/deno/browsers), local to this module: the zero-ambient-types
// library program (docs §44) has no TextDecoder in scope, and the type never
// surfaces in a public signature, so a module-local lookup beats widening
// primitives' platform surface (the caching.core
// distributed-cache-augmentations precedent). Through `unknown` because the
// bare-lib `typeof globalThis` genuinely lacks the property.
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new() => Utf8Decoder; };
const utf8Decoder = new TextDecoder();

/** Provides configuration key/value pairs obtained from a JSON stream payload. */
export class JsonStreamConfigurationProvider extends StreamConfigurationProvider {
  public constructor(source: JsonStreamConfigurationSource) {
    super(source);
  }

  /** Parses and flattens the JSON payload into this provider's store. */
  public override loadStream(stream: StreamPayload): void {
    const raw = typeof stream === 'string' ? stream : utf8Decoder.decode(stream);
    for (const [key, value] of JsonConfigurationFileParser.parse(raw, 'JsonStreamConfigurationProvider')) {
      this.set(key, value);
    }
  }
}

// IniStreamConfigProvider -- loads INI configuration from an in-memory
// stream payload; mirrors the reference `IniStreamConfigProvider`. Same
// grammar as IniConfigProvider -- both delegate to IniStreamParser.

import { StreamConfigProvider, type StreamPayload } from '@rhombus-std/config';
import { IniStreamParser } from './ini-stream-parser';
import type { IniStreamConfigSource } from './IniStreamConfigSource';

// The platform UTF-8 decoder, looked up module-locally (the zero-ambient-types
// library program has no TextDecoder in scope, docs §44); mirrors config.json's
// JsonStreamConfigProvider.
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new() => Utf8Decoder; };
const utf8Decoder = new TextDecoder();

export class IniStreamConfigProvider extends StreamConfigProvider {
  public constructor(source: IniStreamConfigSource) {
    super(source);
  }

  public override loadStream(stream: StreamPayload): void {
    const content = typeof stream === 'string' ? stream : utf8Decoder.decode(stream);
    for (const [key, value] of IniStreamParser.parse(content)) {
      this.set(key, value);
    }
  }
}

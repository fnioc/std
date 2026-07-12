// IniStreamConfigurationProvider -- loads INI configuration from an in-memory
// stream payload; mirrors the reference `IniStreamConfigurationProvider`. Same
// grammar as IniConfigurationProvider -- both delegate to IniStreamParser.

import { StreamConfigurationProvider, type StreamPayload } from '@rhombus-std/config';
import { IniStreamParser } from './ini-stream-parser';
import type { IniStreamConfigurationSource } from './IniStreamConfigurationSource';

// The platform UTF-8 decoder, looked up module-locally (the zero-ambient-types
// library program has no TextDecoder in scope, docs §44); mirrors config.json's
// JsonStreamConfigurationProvider.
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new() => Utf8Decoder; };
const utf8Decoder = new TextDecoder();

export class IniStreamConfigurationProvider extends StreamConfigurationProvider {
  public constructor(source: IniStreamConfigurationSource) {
    super(source);
  }

  public override loadStream(stream: StreamPayload): void {
    const content = typeof stream === 'string' ? stream : utf8Decoder.decode(stream);
    for (const [key, value] of IniStreamParser.parse(content)) {
      this.set(key, value);
    }
  }
}

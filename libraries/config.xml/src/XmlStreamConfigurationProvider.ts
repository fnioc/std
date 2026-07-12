// XmlStreamConfigurationProvider -- loads XML configuration from an in-memory
// stream payload; mirrors the reference `XmlStreamConfigurationProvider`. Same
// grammar as XmlConfigurationProvider -- both delegate to XmlStreamParser.

import { StreamConfigurationProvider, type StreamPayload } from '@rhombus-std/config';
import { XmlStreamParser } from './xml-stream-parser';
import type { XmlStreamConfigurationSource } from './XmlStreamConfigurationSource';

// The platform UTF-8 decoder, looked up module-locally (docs §44); mirrors
// config.json/config.ini's stream providers.
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new() => Utf8Decoder; };
const utf8Decoder = new TextDecoder();

export class XmlStreamConfigurationProvider extends StreamConfigurationProvider {
  public constructor(source: XmlStreamConfigurationSource) {
    super(source);
  }

  public override loadStream(stream: StreamPayload): void {
    const content = typeof stream === 'string' ? stream : utf8Decoder.decode(stream);
    for (const [key, value] of XmlStreamParser.parse(content)) {
      this.set(key, value);
    }
  }
}

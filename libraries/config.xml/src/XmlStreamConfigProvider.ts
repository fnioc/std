// XmlStreamConfigProvider -- loads XML configuration from an in-memory
// stream payload; mirrors the reference `XmlStreamConfigProvider`. Same
// grammar as XmlConfigProvider -- both delegate to XmlStreamParser.

import { StreamConfigProvider, type StreamPayload } from '@rhombus-std/config';
import { XmlStreamParser } from './xml-stream-parser';
import type { XmlStreamConfigSource } from './XmlStreamConfigSource';

// The platform UTF-8 decoder, looked up module-locally (docs §44); mirrors
// config.json/config.ini's stream providers.
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new() => Utf8Decoder; };
const utf8Decoder = new TextDecoder();

export class XmlStreamConfigProvider extends StreamConfigProvider {
  public constructor(source: XmlStreamConfigSource) {
    super(source);
  }

  public override loadStream(stream: StreamPayload): void {
    const content = typeof stream === 'string' ? stream : utf8Decoder.decode(stream);
    for (const [key, value] of XmlStreamParser.parse(content)) {
      this.set(key, value);
    }
  }
}

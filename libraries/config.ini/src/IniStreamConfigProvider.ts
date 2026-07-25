// IniStreamConfigProvider -- loads INI configuration from an in-memory
// stream payload. Same grammar as IniConfigProvider -- both delegate to
// IniStreamParser.

import { StreamConfigProvider, type StreamPayload } from '@rhombus-std/config';
import type { IniStreamConfigSource } from './IniStreamConfigSource';
import { IniStreamParser } from './IniStreamParser';

// The platform UTF-8 decoder, looked up module-locally since this library's
// program has no TextDecoder ambient type in scope.
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

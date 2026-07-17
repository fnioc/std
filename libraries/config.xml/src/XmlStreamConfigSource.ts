// XmlStreamConfigSource -- represents an in-memory XML payload as an
// IConfigSource; mirrors the reference `XmlStreamConfigSource`.
// Payload/once-only handling lives on config's stream bases; this class only
// picks the concrete provider.

import { StreamConfigSource } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigProvider } from '@rhombus-std/config.core';
import { XmlStreamConfigProvider } from './XmlStreamConfigProvider';

/** Represents an in-memory XML payload as an {@link IConfigSource}. */
export class XmlStreamConfigSource extends StreamConfigSource {
  public override build(_builder: IConfigBuilder): IConfigProvider {
    return new XmlStreamConfigProvider(this);
  }
}

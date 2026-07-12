// XmlStreamConfigurationSource -- represents an in-memory XML payload as an
// IConfigurationSource; mirrors the reference `XmlStreamConfigurationSource`.
// Payload/once-only handling lives on config's stream bases; this class only
// picks the concrete provider.

import { StreamConfigurationSource } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationProvider } from '@rhombus-std/config.core';
import { XmlStreamConfigurationProvider } from './XmlStreamConfigurationProvider';

/** Represents an in-memory XML payload as an {@link IConfigurationSource}. */
export class XmlStreamConfigurationSource extends StreamConfigurationSource {
  public override build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new XmlStreamConfigurationProvider(this);
  }
}

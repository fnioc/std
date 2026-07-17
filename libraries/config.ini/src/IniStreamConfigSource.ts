// IniStreamConfigSource -- represents an in-memory INI payload as an
// IConfigSource; mirrors the reference `IniStreamConfigSource`.
// The payload/once-only handling lives on the abstract stream bases in
// @rhombus-std/config; this class only picks the concrete provider.

import { StreamConfigSource } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigProvider } from '@rhombus-std/config.core';
import { IniStreamConfigProvider } from './IniStreamConfigProvider';

/** Represents an in-memory INI payload as an {@link IConfigSource}. */
export class IniStreamConfigSource extends StreamConfigSource {
  public override build(_builder: IConfigBuilder): IConfigProvider {
    return new IniStreamConfigProvider(this);
  }
}

// IniStreamConfigurationSource -- represents an in-memory INI payload as an
// IConfigurationSource; mirrors the reference `IniStreamConfigurationSource`.
// The payload/once-only handling lives on the abstract stream bases in
// @rhombus-std/config; this class only picks the concrete provider.

import { StreamConfigurationSource } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationProvider } from '@rhombus-std/config.core';
import { IniStreamConfigurationProvider } from './IniStreamConfigurationProvider';

/** Represents an in-memory INI payload as an {@link IConfigurationSource}. */
export class IniStreamConfigurationSource extends StreamConfigurationSource {
  public override build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new IniStreamConfigurationProvider(this);
  }
}

// JsonStreamConfigurationSource -- represents an in-memory JSON payload as an
// IConfigurationSource; mirrors the reference `JsonStreamConfigurationSource`.
// The payload/once-only handling all lives on the abstract stream bases in
// @rhombus-std/config -- this class only picks the concrete provider.

import { StreamConfigurationSource } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationProvider } from '@rhombus-std/config.core';
import { JsonStreamConfigurationProvider } from './JsonStreamConfigurationProvider';

/** Represents an in-memory JSON payload as an {@link IConfigurationSource}. */
export class JsonStreamConfigurationSource extends StreamConfigurationSource {
  /** Builds the {@link JsonStreamConfigurationProvider} for this source. */
  public override build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new JsonStreamConfigurationProvider(this);
  }
}

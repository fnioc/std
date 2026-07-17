// JsonStreamConfigSource -- represents an in-memory JSON payload as an
// IConfigSource; mirrors the reference `JsonStreamConfigSource`.
// The payload/once-only handling all lives on the abstract stream bases in
// @rhombus-std/config -- this class only picks the concrete provider.

import { StreamConfigSource } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigProvider } from '@rhombus-std/config.core';
import { JsonStreamConfigProvider } from './JsonStreamConfigProvider';

/** Represents an in-memory JSON payload as an {@link IConfigSource}. */
export class JsonStreamConfigSource extends StreamConfigSource {
  /** Builds the {@link JsonStreamConfigProvider} for this source. */
  public override build(_builder: IConfigBuilder): IConfigProvider {
    return new JsonStreamConfigProvider(this);
  }
}

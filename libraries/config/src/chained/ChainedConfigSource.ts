// ChainedConfigSource -- wraps an already-built IConfig as a
// source, so it can be added to another builder/manager. `configuration` is
// required (unlike MemoryConfigSource's optional `initialData`) -- a
// chained source with nothing to chain isn't a meaningful state, so the type
// itself rules it out rather than a construction-time throw.

import type { IConfig, IConfigBuilder, IConfigProvider, IConfigSource } from '@rhombus-std/config.core';
import { ChainedConfigProvider } from './ChainedConfigProvider';

/** A source that chains an existing {@link IConfig} into another configuration tree. */
export class ChainedConfigSource implements IConfigSource {
  /** The chained configuration. */
  public configuration: IConfig;

  /** Whether {@link configuration} is disposed when the provider built from this source is disposed. */
  public shouldDisposeConfiguration: boolean;

  public constructor(options: { configuration: IConfig; shouldDisposeConfiguration?: boolean; }) {
    this.configuration = options.configuration;
    this.shouldDisposeConfiguration = options.shouldDisposeConfiguration ?? false;
  }

  public build(_builder: IConfigBuilder): IConfigProvider {
    return new ChainedConfigProvider(this);
  }
}

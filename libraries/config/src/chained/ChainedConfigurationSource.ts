// ChainedConfigurationSource -- wraps an already-built IConfiguration as a
// source, so it can be added to another builder/manager. `configuration` is
// required (unlike MemoryConfigurationSource's optional `initialData`) -- a
// chained source with nothing to chain isn't a meaningful state, so the type
// itself rules it out rather than a construction-time throw.

import type { IConfiguration, IConfigurationBuilder, IConfigurationProvider,
  IConfigurationSource } from '@rhombus-std/config.core';
import { ChainedConfigurationProvider } from './ChainedConfigurationProvider';

/** A source that chains an existing {@link IConfiguration} into another configuration tree. */
export class ChainedConfigurationSource implements IConfigurationSource {
  /** The chained configuration. */
  public configuration: IConfiguration;

  /** Whether {@link configuration} is disposed when the provider built from this source is disposed. */
  public shouldDisposeConfiguration: boolean;

  public constructor(options: { configuration: IConfiguration; shouldDisposeConfiguration?: boolean; }) {
    this.configuration = options.configuration;
    this.shouldDisposeConfiguration = options.shouldDisposeConfiguration ?? false;
  }

  public build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new ChainedConfigurationProvider(this);
  }
}

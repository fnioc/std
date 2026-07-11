// JsonConfigurationSource -- builds a JsonConfigurationProvider bound to a
// path + the file-existence/optionality options. There's no separate shared
// "file source" base class -- with only one file-based provider in this
// library, that indirection isn't worth the extra layer, so the path/
// optionality handling is folded in directly here.

import type { IConfigurationBuilder, IConfigurationProvider, IConfigurationSource } from '@rhombus-std/config.core';
import { JsonConfigurationProvider } from './JsonConfigurationProvider';

/** Options accepted by {@link JsonConfigurationSource}'s constructor. */
export interface JsonConfigurationSourceOptions {
  /**
   * When `true`, a missing file yields an empty provider instead of
   * throwing. Malformed JSON in a file that *does* exist always throws,
   * regardless of this flag -- "optional" only covers file absence, not
   * file validity.
   */
  optional?: boolean;
}

/**
 * A {@link IConfigurationSource} that reads a JSON file from disk (resolved
 * relative to `process.cwd()`) and flattens it into the case-insensitive
 * key/value store shared by every {@link ConfigurationProvider}.
 */
export class JsonConfigurationSource implements IConfigurationSource {
  public readonly path: string;
  public readonly optional: boolean;

  public constructor(path: string, opts?: JsonConfigurationSourceOptions) {
    this.path = path;
    this.optional = opts?.optional ?? false;
  }

  public build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new JsonConfigurationProvider(this);
  }
}

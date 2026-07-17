// IniConfigSource -- a file-backed source that reads an INI file into
// the case-insensitive key/value store. Derives from the shared
// FileConfigSource base (config.file); this class only picks the
// concrete provider. Mirrors config.json's file source, options and all.

import type { IConfigBuilder, IConfigProvider } from '@rhombus-std/config.core';
import { FileConfigSource } from '@rhombus-std/config.file';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { IniConfigProvider } from './IniConfigProvider';

/** Options accepted by {@link IniConfigSource}'s constructor. */
export interface IniConfigSourceOptions {
  /** When `true`, a missing file yields an empty provider instead of throwing. */
  optional?: boolean;
  /** When `true`, the source reloads when the backing file changes. */
  reloadOnChange?: boolean;
  /** Milliseconds a reload waits before re-reading (defaults to 250). */
  reloadDelay?: number;
  /** The file provider used to access the file (defaults to the builder's). */
  fileProvider?: IFileProvider;
}

/** A {@link IConfigSource} that reads an INI file. */
export class IniConfigSource extends FileConfigSource {
  public constructor(path: string, opts?: IniConfigSourceOptions) {
    super();
    this.path = path;
    this.optional = opts?.optional ?? false;
    if (opts?.reloadOnChange !== undefined) {
      this.reloadOnChange = opts.reloadOnChange;
    }
    if (opts?.reloadDelay !== undefined) {
      this.reloadDelay = opts.reloadDelay;
    }
    if (opts?.fileProvider !== undefined) {
      this.fileProvider = opts.fileProvider;
    }
  }

  public override build(builder: IConfigBuilder): IConfigProvider {
    // resolveFileProvider before ensureDefaults so an absolute path self-roots
    // (see JsonConfigSource for the rationale).
    this.resolveFileProvider();
    this.ensureDefaults(builder);
    return new IniConfigProvider(this);
  }
}

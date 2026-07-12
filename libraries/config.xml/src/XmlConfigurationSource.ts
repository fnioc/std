// XmlConfigurationSource -- a file-backed source that reads an XML file into
// the case-insensitive key/value store. Derives from FileConfigurationSource
// (config.file); this class only picks the concrete provider. Mirrors
// config.json/config.ini's file source.

import type { IConfigurationBuilder, IConfigurationProvider } from '@rhombus-std/config.core';
import { FileConfigurationSource } from '@rhombus-std/config.file';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { XmlConfigurationProvider } from './XmlConfigurationProvider';

/** Options accepted by {@link XmlConfigurationSource}'s constructor. */
export interface XmlConfigurationSourceOptions {
  /** When `true`, a missing file yields an empty provider instead of throwing. */
  optional?: boolean;
  /** When `true`, the source reloads when the backing file changes. */
  reloadOnChange?: boolean;
  /** Milliseconds a reload waits before re-reading (defaults to 250). */
  reloadDelay?: number;
  /** The file provider used to access the file (defaults to the builder's). */
  fileProvider?: IFileProvider;
}

/** A {@link IConfigurationSource} that reads an XML file. */
export class XmlConfigurationSource extends FileConfigurationSource {
  public constructor(path: string, opts?: XmlConfigurationSourceOptions) {
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

  public override build(builder: IConfigurationBuilder): IConfigurationProvider {
    // resolveFileProvider before ensureDefaults so an absolute path self-roots
    // (see JsonConfigurationSource for the rationale).
    this.resolveFileProvider();
    this.ensureDefaults(builder);
    return new XmlConfigurationProvider(this);
  }
}

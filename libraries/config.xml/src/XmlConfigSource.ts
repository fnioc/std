// XmlConfigSource -- a file-backed source that reads an XML file into
// the case-insensitive key/value store. Derives from FileConfigSource
// (config.file); this class only picks the concrete provider. Mirrors
// config.json/config.ini's file source.

import type { IConfigBuilder, IConfigProvider } from '@rhombus-std/config.core';
import { FileConfigSource } from '@rhombus-std/config.file';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { XmlConfigProvider } from './XmlConfigProvider';

/** Options accepted by {@link XmlConfigSource}'s constructor. */
export interface XmlConfigSourceOptions {
  /** When `true`, a missing file yields an empty provider instead of throwing. */
  optional?: boolean;
  /** When `true`, the source reloads when the backing file changes. */
  reloadOnChange?: boolean;
  /** Milliseconds a reload waits before re-reading (defaults to 250). */
  reloadDelay?: number;
  /** The file provider used to access the file (defaults to the builder's). */
  fileProvider?: IFileProvider;
}

/** A {@link IConfigSource} that reads an XML file. */
export class XmlConfigSource extends FileConfigSource {
  public constructor(path: string, opts?: XmlConfigSourceOptions) {
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
    return new XmlConfigProvider(this);
  }
}

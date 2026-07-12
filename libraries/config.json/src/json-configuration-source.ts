// JsonConfigurationSource -- a file-backed source that reads a JSON file and
// flattens it into the case-insensitive key/value store. Derives from the
// shared FileConfigurationSource base (config.file), so the file provider,
// optionality, and reload-on-change machinery come for free; this class only
// picks the concrete provider.

import type { IConfigurationBuilder, IConfigurationProvider } from '@rhombus-std/config.core';
import { FileConfigurationSource } from '@rhombus-std/config.file';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { JsonConfigurationProvider } from './JsonConfigurationProvider';

/** Options accepted by {@link JsonConfigurationSource}'s constructor. */
export interface JsonConfigurationSourceOptions {
  /**
   * When `true`, a missing file yields an empty provider instead of throwing.
   * Malformed JSON in a file that *does* exist always throws, regardless of
   * this flag -- "optional" only covers file absence, not file validity.
   */
  optional?: boolean;
  /** When `true`, the source reloads when the backing file changes. */
  reloadOnChange?: boolean;
  /** Milliseconds a reload waits before re-reading (defaults to 250). */
  reloadDelay?: number;
  /** The file provider used to access the file (defaults to the builder's). */
  fileProvider?: IFileProvider;
}

/**
 * A {@link IConfigurationSource} that reads a JSON file and flattens it into
 * the case-insensitive key/value store shared by every
 * {@link ConfigurationProvider}. With no explicit `fileProvider`, the file is
 * resolved relative to `process.cwd()` (the builder default), reproducing the
 * pre-file-base cwd-relative behavior.
 */
export class JsonConfigurationSource extends FileConfigurationSource {
  public constructor(path: string, opts?: JsonConfigurationSourceOptions) {
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
    // resolveFileProvider BEFORE ensureDefaults so an absolute path self-roots
    // (directory-rooted provider + bare file name) instead of being resolved
    // against the cwd default. DEVIATION from the reference (which resolves
    // only inside the AddJsonFile ladder): doing it here too keeps direct
    // `new JsonConfigurationSource(absolutePath).build(...)` construction
    // reading absolute paths, as the pre-file-base provider did.
    this.resolveFileProvider();
    this.ensureDefaults(builder);
    return new JsonConfigurationProvider(this);
  }
}

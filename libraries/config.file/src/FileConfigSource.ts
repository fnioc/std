// FileConfigSource -- the abstract base for every file-backed
// configuration source (JSON, INI, XML). Ported from the reference
// `FileConfigSource`. Holds the file provider + path + optionality +
// reload settings a concrete source's `build` turns into a
// FileConfigProvider, and the two builder-default hooks
// (`ensureDefaults`, `resolveFileProvider`) that resolve a file provider when
// the caller didn't supply one.

import type { IConfigBuilder, IConfigProvider, IConfigSource } from '@rhombus-std/config.core';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import type { Func } from '@rhombus-toolkit/func';
import { basename, dirname, isAbsolute } from 'node:path';
import type { FileLoadErrorContext } from './FileLoadErrorContext';

/** The base class for file-based {@link IConfigSource} implementations. */
export abstract class FileConfigSource implements IConfigSource {
  /** The provider used to access the contents of the file. */
  public fileProvider?: IFileProvider;

  /** The path to the file, relative to {@link fileProvider}'s root. */
  public path?: string;

  /** Whether loading the file is optional (a missing file yields an empty provider). */
  public optional = false;

  /** Whether the source reloads when the underlying file changes. */
  public reloadOnChange = false;

  /**
   * Milliseconds a reload waits before re-reading, so a half-written file
   * isn't parsed mid-write. Defaults to 250.
   */
  public reloadDelay = 250;

  /** Called if an uncaught error occurs while the provider loads the file. */
  public onLoadError?: Func<[FileLoadErrorContext], void>;

  /** Builds the {@link IConfigProvider} for this source. */
  public abstract build(builder: IConfigBuilder): IConfigProvider;

  /**
   * Applies the builder-wide defaults -- the default file provider and
   * load-error handler stashed in `builder.properties` -- for any option the
   * caller left unset.
   */
  public ensureDefaults(builder: IConfigBuilder): void {
    this.fileProvider ??= builder.getFileProvider();
    this.onLoadError ??= builder.getFileLoadErrorHandler();
  }

  /**
   * When no file provider was set but the path is absolute, roots a
   * {@link PhysicalFileProvider} at the file's directory and rewrites
   * {@link path} to the bare file name, so the provider's root-relative
   * lookup finds it.
   */
  public resolveFileProvider(): void {
    if (this.fileProvider == null && this.path && isAbsolute(this.path)) {
      const directory = dirname(this.path);
      this.fileProvider = new PhysicalFileProvider(directory);
      this.path = basename(this.path);
    }
  }
}

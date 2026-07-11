// NullFileProvider -- ported from ME.FileProviders.NullFileProvider.
//
// An empty provider: every lookup misses, and Watch monitors nothing.

import type { IChangeToken } from '@rhombus-std/primitives';
import type { IDirectoryContents } from './IDirectoryContents.js';
import type { IFileInfo } from './IFileInfo.js';
import type { IFileProvider } from './IFileProvider.js';
import { NotFoundDirectoryContents } from './NotFoundDirectoryContents.js';
import { NotFoundFileInfo } from './NotFoundFileInfo.js';
import { NullChangeToken } from './NullChangeToken.js';

/**
 * An empty file provider with no contents.
 */
export class NullFileProvider implements IFileProvider {
  /**
   * Enumerates a nonexistent directory.
   *
   * @param _subpath A path under the root directory. This parameter is ignored.
   * @returns A {@link IDirectoryContents} that does not exist and contains no
   * entries.
   */
  public getDirectoryContents(_subpath: string): IDirectoryContents {
    return NotFoundDirectoryContents.singleton;
  }

  /**
   * Locates a nonexistent file.
   *
   * @param subpath A path under the root directory.
   * @returns A {@link IFileInfo} representing a nonexistent file at the given
   * path.
   */
  public getFileInfo(subpath: string): IFileInfo {
    return new NotFoundFileInfo(subpath);
  }

  /**
   * Returns a change token that monitors nothing.
   *
   * @param _filter A filter string. This parameter is ignored.
   * @returns A {@link IChangeToken} that does not register callbacks.
   */
  public watch(_filter: string): IChangeToken {
    return NullChangeToken.singleton;
  }
}

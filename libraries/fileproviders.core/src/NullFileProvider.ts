// An empty provider: every lookup misses, and watch monitors nothing.

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
  public getDirectoryContents(_subpath: string): IDirectoryContents {
    return NotFoundDirectoryContents.singleton;
  }

  public getFileInfo(subpath: string): IFileInfo {
    return new NotFoundFileInfo(subpath);
  }

  public watch(_filter: string): IChangeToken {
    return NullChangeToken.singleton;
  }
}

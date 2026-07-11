// NotFoundDirectoryContents -- ported from
// ME.FileProviders.NotFoundDirectoryContents.
//
// ME's `GetEnumerator() => Enumerable.Empty<IFileInfo>()` maps to an empty
// iterator via a `*[Symbol.iterator]()` generator that yields nothing.

import type { IDirectoryContents } from './IDirectoryContents.js';
import type { IFileInfo } from './IFileInfo.js';

/**
 * Represents a nonexistent directory.
 */
export class NotFoundDirectoryContents implements IDirectoryContents {
  /**
   * The shared instance of {@link NotFoundDirectoryContents}.
   */
  public static readonly singleton: NotFoundDirectoryContents = new NotFoundDirectoryContents();

  /**
   * A value that's always `false`.
   */
  public readonly exists = false;

  /**
   * Returns an iterator over an empty collection.
   */
  public *[Symbol.iterator](): Generator<IFileInfo> {}
}

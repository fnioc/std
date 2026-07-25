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

  public readonly exists = false;

  public *[Symbol.iterator](): Generator<IFileInfo> {}
}

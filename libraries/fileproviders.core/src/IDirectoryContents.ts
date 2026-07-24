import type { IFileInfo } from './IFileInfo.js';

/**
 * Represents a directory's content in the file provider.
 */
export interface IDirectoryContents extends Iterable<IFileInfo> {
  /**
   * `true` if a directory was located at the given path.
   */
  readonly exists: boolean;
}

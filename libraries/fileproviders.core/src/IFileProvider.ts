import type { IChangeToken } from '@rhombus-std/primitives';
import type { IDirectoryContents } from './IDirectoryContents.js';
import type { IFileInfo } from './IFileInfo.js';

/**
 * A read-only file provider abstraction.
 */
export interface IFileProvider {
  /**
   * @param subpath A path relative to this provider's root.
   * @returns The caller must check the returned {@link IFileInfo.exists}
   * property — a miss is a value, not an error.
   */
  getFileInfo(subpath: string): IFileInfo;

  /**
   * @param subpath A path relative to this provider's root.
   */
  getDirectoryContents(subpath: string): IDirectoryContents;

  /**
   * Creates an {@link IChangeToken} for the specified `filter`.
   *
   * @param filter A filter string used to determine what files or folders to
   * monitor. Examples: `**\/*.ts`, `*.*`, `subFolder/**\/*.html`.
   * @returns An {@link IChangeToken} that is notified when a file matching
   * `filter` is added, modified, or deleted.
   */
  watch(filter: string): IChangeToken;
}

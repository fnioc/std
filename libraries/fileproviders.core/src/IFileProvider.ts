// IFileProvider -- ported from ME.FileProviders.IFileProvider.

import type { IChangeToken } from "@rhombus-std/primitives";
import type { IDirectoryContents } from "./IDirectoryContents.js";
import type { IFileInfo } from "./IFileInfo.js";

/**
 * A read-only file provider abstraction.
 */
export interface IFileProvider {
  /**
   * Locates a file at the given path.
   *
   * @param subpath The relative path that identifies the file.
   * @returns The file information. The caller must check the
   * {@link IFileInfo.exists} property.
   */
  getFileInfo(subpath: string): IFileInfo;

  /**
   * Enumerates a directory at the given path, if any.
   *
   * @param subpath The relative path that identifies the directory.
   * @returns The contents of the directory.
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

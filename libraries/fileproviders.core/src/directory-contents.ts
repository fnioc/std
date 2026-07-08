// IDirectoryContents -- ported from ME.FileProviders.IDirectoryContents.
//
// ME's `IDirectoryContents : IEnumerable<IFileInfo>` maps to extending the
// built-in `Iterable<IFileInfo>` -- the idiomatic TS analog of IEnumerable.

import type { IFileInfo } from "./file-info.js";

/**
 * Represents a directory's content in the file provider.
 */
export interface IDirectoryContents extends Iterable<IFileInfo> {
  /**
   * `true` if a directory was located at the given path.
   */
  readonly exists: boolean;
}

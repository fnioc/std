// PhysicalDirectoryContents -- ported from
// ME.FileProviders.Physical.Internal.PhysicalDirectoryContents.
//
// A thin IDirectoryContents wrapper that delegates existence and enumeration
// to a PhysicalDirectoryInfo (exactly as the reference does).

import type { IDirectoryContents, IFileInfo } from '@rhombus-std/fileproviders.core';

import type { ExclusionFilters } from './ExclusionFilters.js';
import { PhysicalDirectoryInfo } from './PhysicalDirectoryInfo.js';

/**
 * Represents the contents of a directory on the physical file system.
 */
export class PhysicalDirectoryContents implements IDirectoryContents {
  readonly #info: PhysicalDirectoryInfo;

  /**
   * Initializes a new instance of the {@link PhysicalDirectoryContents} class.
   *
   * @param directory The absolute path to the directory to represent.
   * @param filters The exclusion filters applied when enumerating children.
   */
  public constructor(directory: string, filters: ExclusionFilters) {
    this.#info = new PhysicalDirectoryInfo(directory, filters);
  }

  /**
   * A value that indicates whether the directory exists on disk.
   */
  public get exists(): boolean {
    return this.#info.exists;
  }

  /**
   * Iterates the directory's children.
   */
  public [Symbol.iterator](): Iterator<IFileInfo> {
    return this.#info[Symbol.iterator]();
  }
}

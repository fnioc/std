// PhysicalFileProvider -- ported from
// ME.FileProviders.Physical.PhysicalFileProvider.
//
// Serves IFileInfo/IDirectoryContents off the on-disk file system rooted at an
// absolute directory. Every lookup is guarded against escaping the root (empty
// or invalid subpaths, absolute subpaths, and `..` traversal above the root
// all resolve to the not-found singletons).
//
// DEVIATION (flagged): the reference's under-root guard compares with
// OrdinalIgnoreCase (reflecting Windows' case-insensitive file system). On the
// repo's target platform (Linux) paths are case-sensitive, so the guard here
// uses a case-sensitive prefix check -- the more correct behavior for POSIX.

import { statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { type IDirectoryContents, type IFileInfo, type IFileProvider, NotFoundDirectoryContents,
  NotFoundFileInfo } from '@rhombus-std/fileproviders.core';
import type { IChangeToken } from '@rhombus-std/primitives';

import { ExclusionFilters } from './ExclusionFilters.js';
import { isExcluded } from './FileSystemInfoHelper.js';
import { ensureTrailingSeparator, hasInvalidPathChars, pathNavigatesAboveRoot,
  trimStartSeparators } from './PathUtils.js';
import { PhysicalDirectoryContents } from './PhysicalDirectoryContents.js';
import { PhysicalFileInfo } from './PhysicalFileInfo.js';

/**
 * Looks up files using the on-disk file system.
 */
export class PhysicalFileProvider implements IFileProvider {
  readonly #root: string;
  readonly #filters: ExclusionFilters;
  #disposed = false;

  /**
   * Initializes a new instance of the {@link PhysicalFileProvider} class at the
   * given root directory.
   *
   * @param root The root directory. This must be an absolute path.
   * @param filters The exclusion filters applied to lookups and enumeration.
   * Defaults to {@link ExclusionFilters.Sensitive}.
   */
  public constructor(root: string, filters: ExclusionFilters = ExclusionFilters.Sensitive) {
    if (!isAbsolute(root)) {
      throw new Error('The path must be absolute.');
    }
    // Match on full directory names by keeping a trailing separator on the root.
    this.#root = ensureTrailingSeparator(resolve(root));
    this.#filters = filters;
  }

  /**
   * The root directory for this instance, with a trailing separator.
   */
  public get root(): string {
    return this.#root;
  }

  #getFullPath(subpath: string): string | undefined {
    if (pathNavigatesAboveRoot(subpath)) {
      return undefined;
    }
    let fullPath: string;
    try {
      fullPath = resolve(join(this.#root, subpath));
    } catch {
      return undefined;
    }
    if (!fullPath.startsWith(this.#root)) {
      return undefined;
    }
    return fullPath;
  }

  /**
   * Locates a file at the given path by mapping path segments to physical
   * directories.
   *
   * @param subpath A path under the root directory. Leading slashes are
   * ignored.
   * @returns The file information. The caller must check
   * {@link IFileInfo.exists}. A {@link NotFoundFileInfo} is returned for an
   * empty, invalid, absolute, out-of-root, or excluded path.
   */
  public getFileInfo(subpath: string): IFileInfo {
    if (subpath.length === 0 || hasInvalidPathChars(subpath)) {
      return new NotFoundFileInfo(subpath);
    }

    const trimmed = trimStartSeparators(subpath);
    if (isAbsolute(trimmed)) {
      return new NotFoundFileInfo(subpath);
    }

    const fullPath = this.#getFullPath(trimmed);
    if (fullPath === undefined) {
      return new NotFoundFileInfo(subpath);
    }

    const fileInfo = new PhysicalFileInfo(fullPath);
    if (isExcluded(fileInfo.name, this.#filters)) {
      return new NotFoundFileInfo(subpath);
    }

    return fileInfo;
  }

  /**
   * Enumerates a directory at the given path, if any.
   *
   * @param subpath A path under the root directory. Leading slashes are
   * ignored.
   * @returns The contents of the directory, or
   * {@link NotFoundDirectoryContents.singleton} for an invalid, absolute,
   * out-of-root, or nonexistent directory.
   */
  public getDirectoryContents(subpath: string): IDirectoryContents {
    try {
      if (hasInvalidPathChars(subpath)) {
        return NotFoundDirectoryContents.singleton;
      }

      const trimmed = trimStartSeparators(subpath);
      if (isAbsolute(trimmed)) {
        return NotFoundDirectoryContents.singleton;
      }

      const fullPath = this.#getFullPath(trimmed);
      if (fullPath === undefined) {
        return NotFoundDirectoryContents.singleton;
      }

      const stats = statSync(fullPath, { throwIfNoEntry: false });
      if (stats === undefined || !stats.isDirectory()) {
        return NotFoundDirectoryContents.singleton;
      }

      return new PhysicalDirectoryContents(fullPath, this.#filters);
    } catch {
      return NotFoundDirectoryContents.singleton;
    }
  }

  /**
   * Creates a change token for the given filter. Not yet implemented -- wired
   * to the file watcher in a following change.
   *
   * @param _filter A filter string identifying a file or directory to watch.
   */
  public watch(_filter: string): IChangeToken {
    throw new Error('PhysicalFileProvider.watch is not yet implemented.');
  }

  /**
   * Disposes the provider. Idempotent.
   */
  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
  }
}

// PhysicalDirectoryInfo -- ported from
// ME.FileProviders.Physical.PhysicalDirectoryInfo.
//
// Represents a directory on the physical file system. It is both an IFileInfo
// (describing the directory entry itself: length -1, isDirectory true,
// createReadStream throws) and an IDirectoryContents (its lazily-enumerated,
// exclusion-filtered children). Enumeration swallows a missing/inaccessible
// directory into an empty result, mirroring the reference's catch of
// DirectoryNotFoundException/IOException.

import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { IDirectoryContents, IFileInfo } from '@rhombus-std/fileproviders.core';
import type { ReadableStream } from '@rhombus-std/primitives';

import type { ExclusionFilters } from './ExclusionFilters.js';
import { isExcluded } from './FileSystemInfoHelper.js';
import { PhysicalFileInfo } from './PhysicalFileInfo.js';

/**
 * Represents a directory on the physical file system.
 */
export class PhysicalDirectoryInfo implements IFileInfo, IDirectoryContents {
  readonly #fullPath: string;
  readonly #name: string;
  readonly #filters: ExclusionFilters;
  #entries: IFileInfo[] | undefined;

  /**
   * Initializes a new instance of the {@link PhysicalDirectoryInfo} class over
   * the given absolute directory path.
   *
   * @param fullPath The absolute path to the directory.
   * @param filters The exclusion filters applied when enumerating children.
   */
  public constructor(fullPath: string, filters: ExclusionFilters) {
    this.#fullPath = fullPath;
    this.#name = basename(fullPath);
    this.#filters = filters;
  }

  /**
   * A value that indicates whether the directory exists on disk.
   */
  public get exists(): boolean {
    const stats = statSync(this.#fullPath, { throwIfNoEntry: false });
    return stats !== undefined && stats.isDirectory();
  }

  /**
   * A value that's always -1.
   */
  public readonly length = -1;

  /**
   * The absolute path to the directory.
   */
  public get physicalPath(): string {
    return this.#fullPath;
  }

  /**
   * The name of the directory, not including any path.
   */
  public get name(): string {
    return this.#name;
  }

  /**
   * The time when the directory was last written to, or the epoch if it does
   * not exist.
   */
  public get lastModified(): Date {
    const stats = statSync(this.#fullPath, { throwIfNoEntry: false });
    return stats !== undefined ? stats.mtime : new Date(0);
  }

  /**
   * A value that's always `true`.
   */
  public readonly isDirectory = true;

  /**
   * Always throws. A read stream cannot be created for a directory.
   *
   * @returns Never returns.
   */
  public createReadStream(): ReadableStream<Uint8Array> {
    throw new Error('Cannot create a stream for a directory.');
  }

  #ensureEntries(): IFileInfo[] {
    if (this.#entries === undefined) {
      try {
        const dirents = readdirSync(this.#fullPath, { withFileTypes: true });
        const entries: IFileInfo[] = [];
        for (const dirent of dirents) {
          if (isExcluded(dirent.name, this.#filters)) {
            continue;
          }
          const childPath = join(this.#fullPath, dirent.name);
          entries.push(
            dirent.isDirectory()
              ? new PhysicalDirectoryInfo(childPath, this.#filters)
              : new PhysicalFileInfo(childPath),
          );
        }
        this.#entries = entries;
      } catch {
        // The directory may have been deleted or become inaccessible between
        // the existence check and enumeration -- yield nothing.
        this.#entries = [];
      }
    }
    return this.#entries;
  }

  /**
   * Iterates the directory's children, filtered by the active exclusion
   * filters. Directories yield further {@link PhysicalDirectoryInfo}, files
   * yield {@link PhysicalFileInfo}.
   */
  public *[Symbol.iterator](): Generator<IFileInfo> {
    yield* this.#ensureEntries();
  }
}

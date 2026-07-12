// PhysicalFileProvider -- ported from
// ME.FileProviders.Physical.PhysicalFileProvider.
//
// Serves IFileInfo/IDirectoryContents off the on-disk file system rooted at an
// absolute directory, and watches exact files / directory prefixes for changes
// via a lazily-created PhysicalFilesWatcher. Every lookup is guarded against
// escaping the root (empty or invalid subpaths, absolute subpaths, and `..`
// traversal above the root all resolve to the not-found singletons).
//
// DEVIATIONS (flagged):
//   - The reference's under-root guard compares with OrdinalIgnoreCase
//     (reflecting Windows' case-insensitive file system). On the repo's target
//     platform (Linux) paths are case-sensitive, so the guard here uses a
//     case-sensitive prefix check -- the more correct behavior for POSIX.
//   - `watch` supports exact-file and directory-prefix filters only; a filter
//     containing a wildcard throws (see the NAMING/`watch` notes below). The
//     reference routes wildcards to a glob Matcher, deferred here (no wildcard
//     consumer exists; a fileproviders.globbing package would restore it).
//   - NAMING TABOO: the reference's polling env var name embeds the vendor
//     product name and cannot appear in a checked-in file, so it is renamed to
//     RHOMBUS_STD_USE_POLLING_FILE_WATCHER (same "1"/"true" semantics).

import { statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { type IDirectoryContents, type IFileInfo, type IFileProvider, NotFoundDirectoryContents, NotFoundFileInfo,
  NullChangeToken } from '@rhombus-std/fileproviders.core';
import { type IChangeToken, process } from '@rhombus-std/primitives';

import { ExclusionFilters } from './ExclusionFilters.js';
import { isExcluded } from './FileSystemInfoHelper.js';
import { ensureTrailingSeparator, hasInvalidFilterChars, hasInvalidPathChars, pathNavigatesAboveRoot,
  trimStartSeparators } from './PathUtils.js';
import { PhysicalDirectoryContents } from './PhysicalDirectoryContents.js';
import { PhysicalFileInfo } from './PhysicalFileInfo.js';
import { PhysicalFilesWatcher } from './PhysicalFilesWatcher.js';

// The reference's `DOTNET_USE_POLLING_FILE_WATCHER`, renamed to strip the
// vendor product name (NAMING TABOO). "1" or a case-insensitive "true" enables
// polling.
const POLLING_ENVIRONMENT_KEY = 'RHOMBUS_STD_USE_POLLING_FILE_WATCHER';

/**
 * Looks up files using the on-disk file system.
 */
export class PhysicalFileProvider implements IFileProvider {
  readonly #root: string;
  readonly #filters: ExclusionFilters;
  #fileWatcher: PhysicalFilesWatcher | undefined;
  #usePollingFileWatcher: boolean | undefined;
  #useActivePolling: boolean | undefined;
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

  #readPollingEnvironmentVariables(): void {
    const value = process.env[POLLING_ENVIRONMENT_KEY];
    const pollForChanges = value === '1' || value?.toLowerCase() === 'true';
    this.#usePollingFileWatcher = pollForChanges;
    this.#useActivePolling = pollForChanges;
  }

  /**
   * Whether this provider uses polling (rather than an OS file watcher) to
   * detect changes. Defaults from the {@link POLLING_ENVIRONMENT_KEY}
   * environment variable. Cannot be changed once the watcher has been created.
   */
  public get usePollingFileWatcher(): boolean {
    if (this.#fileWatcher !== undefined) {
      return this.#usePollingFileWatcher ?? false;
    }
    if (this.#usePollingFileWatcher === undefined) {
      this.#readPollingEnvironmentVariables();
    }
    return this.#usePollingFileWatcher ?? false;
  }

  public set usePollingFileWatcher(value: boolean) {
    if (this.#fileWatcher !== undefined) {
      throw new Error('Cannot modify usePollingFileWatcher once the file watcher is initialized.');
    }
    this.#usePollingFileWatcher = value;
  }

  /**
   * Whether the change tokens returned by {@link watch} actively poll for
   * changes (raising callbacks) rather than being passive. Only effective when
   * {@link usePollingFileWatcher} is set. Defaults from the environment.
   */
  public get useActivePolling(): boolean {
    if (this.#useActivePolling === undefined) {
      this.#readPollingEnvironmentVariables();
    }
    return this.#useActivePolling ?? false;
  }

  public set useActivePolling(value: boolean) {
    this.#useActivePolling = value;
  }

  #getFileWatcher(): PhysicalFilesWatcher {
    if (this.#fileWatcher === undefined) {
      this.#fileWatcher = new PhysicalFilesWatcher(
        this.#root,
        this.usePollingFileWatcher,
        this.useActivePolling,
        this.#filters,
      );
    }
    return this.#fileWatcher;
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
    // `#root` carries a trailing separator (so a sibling like `<root>x` cannot
    // prefix-match), but `resolve` strips the trailing separator from the root
    // itself -- so the root directory must be matched by equality as well as by
    // the trailing-separator prefix.
    const rootWithoutSeparator = this.#root.slice(0, -1);
    if (fullPath !== rootWithoutSeparator && !fullPath.startsWith(this.#root)) {
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
   * Creates a change token for the specified filter.
   *
   * @param filter An exact file path, or a directory path ending in a
   * separator, relative to the root. Leading slashes are ignored.
   * @returns A change token notified when the target changes, or
   * {@link NullChangeToken.singleton} for a `null`/invalid, absolute, or
   * out-of-root filter.
   * @throws If `filter` contains a wildcard (`*`) -- glob watching is not yet
   * supported (deferred to a future fileproviders.globbing package).
   */
  public watch(filter: string): IChangeToken {
    // A hand-written (no-transformer) JS caller could still pass a nullish
    // filter despite the `string` type, so guard defensively -- mirroring the
    // reference's null check.
    const nullableFilter = filter as string | null | undefined;
    if (nullableFilter === null || nullableFilter === undefined || hasInvalidFilterChars(filter)) {
      return NullChangeToken.singleton;
    }

    const trimmed = trimStartSeparators(filter);

    if (trimmed.includes('*')) {
      throw new Error(
        'Wildcard watch filters are not yet supported; watch an exact file or a directory '
          + 'prefix instead. (A fileproviders.globbing package would restore glob support.)',
      );
    }

    return this.#getFileWatcher().createFileChangeToken(trimmed);
  }

  /**
   * Disposes the provider, closing its file watcher. Idempotent. Change tokens
   * may not trigger after disposal.
   */
  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#fileWatcher?.[Symbol.dispose]();
  }
}

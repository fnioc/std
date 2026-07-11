// CompositeDirectoryContents -- ported from
// ME.FileProviders.Composite.CompositeDirectoryContents.
//
// Represents the merged result of GetDirectoryContents across a list of
// providers for one subpath. Directories and files are initialized lazily
// (mirroring ME's EnsureDirectoriesAreInitialized / EnsureFilesAreInitialized),
// and files are de-duplicated by name -- first provider wins. ME's
// MemberNotNull attributes are compile-time null-flow hints with no TS analog;
// the lazy `#files == null` / `#directories == null` guards carry the same
// once-only-init intent.

import type { IDirectoryContents, IFileInfo, IFileProvider } from '@rhombus-std/fileproviders.core';

/**
 * The merged contents of a directory across several {@link IFileProvider}
 * instances.
 */
export class CompositeDirectoryContents implements IDirectoryContents {
  readonly #fileProviders: readonly IFileProvider[];
  readonly #subpath: string;

  #directories: IDirectoryContents[] | undefined;
  #files: IFileInfo[] | undefined;
  #exists = false;

  /**
   * Initializes a new instance of the {@link CompositeDirectoryContents} class.
   *
   * @param fileProviders The providers whose results are composed.
   * @param subpath The path being enumerated.
   */
  public constructor(fileProviders: readonly IFileProvider[], subpath: string) {
    this.#fileProviders = fileProviders;
    this.#subpath = subpath;
  }

  #ensureDirectoriesAreInitialized(): IDirectoryContents[] {
    if (this.#directories === undefined) {
      const directories: IDirectoryContents[] = [];
      for (const fileProvider of this.#fileProviders) {
        const directoryContents = fileProvider.getDirectoryContents(this.#subpath);
        if (directoryContents.exists) {
          this.#exists = true;
          directories.push(directoryContents);
        }
      }
      this.#directories = directories;
    }
    return this.#directories;
  }

  #ensureFilesAreInitialized(): IFileInfo[] {
    const directories = this.#ensureDirectoriesAreInitialized();
    if (this.#files === undefined) {
      const files: IFileInfo[] = [];
      const names = new Set<string>();
      for (const directoryContents of directories) {
        for (const file of directoryContents) {
          if (!names.has(file.name)) {
            names.add(file.name);
            files.push(file);
          }
        }
      }
      this.#files = files;
    }
    return this.#files;
  }

  /**
   * Iterates every distinct file across all matching providers. Where multiple
   * providers expose a file of the same name, only the first is yielded.
   */
  public *[Symbol.iterator](): Generator<IFileInfo> {
    yield* this.#ensureFilesAreInitialized();
  }

  /**
   * `true` if at least one of the given providers has contents at the subpath.
   */
  public get exists(): boolean {
    this.#ensureDirectoriesAreInitialized();
    return this.#exists;
  }
}

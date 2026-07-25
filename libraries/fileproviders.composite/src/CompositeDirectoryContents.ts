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

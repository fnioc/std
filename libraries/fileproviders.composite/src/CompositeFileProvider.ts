// CompositeFileProvider -- ported from
// ME.FileProviders.Composite.CompositeFileProvider.
//
// Looks up files/directories across a collection of IFileProvider, trying each
// in registration order. ME exposes two constructors (params array + IEnumerable);
// a single rest-parameter constructor covers both, since an existing collection
// is passed with spread (`new CompositeFileProvider(...providers)`).

import { type IDirectoryContents, type IFileInfo, type IFileProvider, NotFoundFileInfo,
  NullChangeToken } from '@rhombus-std/fileproviders.core';
import { CompositeChangeToken, type IChangeToken } from '@rhombus-std/primitives';
import { CompositeDirectoryContents } from './CompositeDirectoryContents.js';

/**
 * Looks up files using a collection of {@link IFileProvider}.
 */
export class CompositeFileProvider implements IFileProvider {
  readonly #fileProviders: readonly IFileProvider[];

  /**
   * Initializes a new instance of the {@link CompositeFileProvider} class.
   *
   * @param fileProviders The providers to compose, tried in the order given.
   */
  public constructor(...fileProviders: IFileProvider[]) {
    this.#fileProviders = fileProviders;
  }

  /**
   * Locates a file at the given path.
   *
   * @param subpath The path that identifies the file.
   * @returns The first existing {@link IFileInfo} returned by the composed
   * providers, or a {@link NotFoundFileInfo} if none exists.
   */
  public getFileInfo(subpath: string): IFileInfo {
    for (const fileProvider of this.#fileProviders) {
      const fileInfo = fileProvider.getFileInfo(subpath);
      if (fileInfo.exists) {
        return fileInfo;
      }
    }
    return new NotFoundFileInfo(subpath);
  }

  /**
   * Enumerates a directory at the given path. The result merges the contents of
   * all composed providers; where several expose a file of the same name, only
   * the first is included.
   *
   * @param subpath The path that identifies the directory.
   */
  public getDirectoryContents(subpath: string): IDirectoryContents {
    return new CompositeDirectoryContents(this.#fileProviders, subpath);
  }

  /**
   * Creates a change token for the specified `pattern`, notified when any
   * composed provider's token for that pattern fires.
   *
   * @param pattern A filter string used to determine what files or folders to
   * monitor.
   */
  public watch(pattern: string): IChangeToken {
    const changeTokens: IChangeToken[] = [];
    for (const fileProvider of this.#fileProviders) {
      const changeToken = fileProvider.watch(pattern);
      if (!(changeToken instanceof NullChangeToken)) {
        changeTokens.push(changeToken);
      }
    }

    if (!changeTokens.length) {
      return NullChangeToken.singleton;
    }
    if (changeTokens.length === 1) {
      return changeTokens[0]!;
    }
    return new CompositeChangeToken(changeTokens);
  }

  /**
   * The composed {@link IFileProvider} instances, in registration order.
   */
  public get fileProviders(): readonly IFileProvider[] {
    return this.#fileProviders;
  }
}

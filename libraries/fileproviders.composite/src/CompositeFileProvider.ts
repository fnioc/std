import { type IDirectoryContents, type IFileInfo, type IFileProvider, NotFoundFileInfo, NullChangeToken } from '@rhombus-std/fileproviders.core';
import { CompositeChangeToken, type IChangeToken } from '@rhombus-std/primitives';
import { CompositeDirectoryContents } from './CompositeDirectoryContents.js';

/**
 * Looks up files using a collection of {@link IFileProvider}.
 */
export class CompositeFileProvider implements IFileProvider {
  readonly #fileProviders: readonly IFileProvider[];

  /** Composes `fileProviders`, tried in the order given. */
  public constructor(...fileProviders: IFileProvider[]) {
    this.#fileProviders = fileProviders;
  }

  /**
   * @returns The first existing {@link IFileInfo} among the composed providers,
   * or a {@link NotFoundFileInfo} if none exists.
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
   * Merges directory contents across all composed providers; where several
   * expose a file of the same name, only the first is included.
   */
  public getDirectoryContents(subpath: string): IDirectoryContents {
    return new CompositeDirectoryContents(this.#fileProviders, subpath);
  }

  /**
   * A change token for `pattern`, notified when any composed provider's token
   * for that pattern fires.
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

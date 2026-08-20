// The file-default hooks every file-backed configuration source reads: which
// IFileProvider to resolve paths against, and what to do when a load throws.
// Both live in the builder's shared `properties` bag, so a source picks them up
// through the plain IConfigBuilder it is handed at build time.

import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import { process } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import type { FileLoadErrorContext } from './FileLoadErrorContext';

// The `builder.properties` keys the default file provider and load-error
// handler are stashed under -- fixed literal strings so the property bag
// stays interoperable across every file-config package. The handler key
// still reads "Exception" (a cross-package data key, not a member name;
// the member and type use "error").
const FILE_PROVIDER_KEY = 'FileProvider';
const FILE_LOAD_ERROR_HANDLER_KEY = 'FileLoadExceptionHandler';

/** The load-error-handler callback stashed on the builder. */
type FileLoadErrorHandler = Func<[FileLoadErrorContext], void>;

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's bodies touch. */
interface ConfigBuilderProperties {
  get properties(): Map<string, unknown>;
}

export namespace ConfigBuilderFileAugmentations {
  /** Sets the default file provider for file-based sources. */
  export function setFileProvider<Self extends ConfigBuilderProperties>(this: Self, fileProvider: IFileProvider): Self {
    this.properties.set(FILE_PROVIDER_KEY, fileProvider);
    return this;
  }

  /** Gets the default file provider (a cwd-rooted PhysicalFileProvider when unset). */
  export function getFileProvider(this: ConfigBuilderProperties): IFileProvider {
    const provider = this.properties.get(FILE_PROVIDER_KEY);
    if (provider !== undefined) {
      return provider as IFileProvider;
    }
    // Falls back to a physical provider rooted at the current working directory.
    return new PhysicalFileProvider(process.cwd());
  }

  /** Roots the default file provider at `basePath`. */
  export function setBasePath<Self extends ConfigBuilderProperties>(this: Self, basePath: string): Self {
    return ConfigBuilderFileAugmentations.setFileProvider.call(this, new PhysicalFileProvider(basePath)) as Self;
  }

  /** Sets the default action invoked when a file-based source's load throws. */
  export function setFileLoadErrorHandler<Self extends ConfigBuilderProperties>(this: Self, handler: FileLoadErrorHandler): Self {
    this.properties.set(FILE_LOAD_ERROR_HANDLER_KEY, handler);
    return this;
  }

  /** Gets the default file-load-error handler, if any. */
  export function getFileLoadErrorHandler(this: ConfigBuilderProperties): FileLoadErrorHandler | undefined {
    return this.properties.get(FILE_LOAD_ERROR_HANDLER_KEY) as FileLoadErrorHandler | undefined;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderFileAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ConfigBuilderFileAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ConfigBuilderFileAugmentations);

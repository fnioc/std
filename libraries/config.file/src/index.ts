// Public entry point for @rhombus-std/config.file -- the shared base layer for
// file-backed configuration providers (JSON, INI, XML).
//
// Exports the abstract FileConfigurationSource/FileConfigurationProvider pair
// every file-format provider derives from, the FileLoadErrorContext handed to
// a load-error handler, the FormatError/InvalidDataError types, and installs
// the `setFileProvider`/`getFileProvider`/`setBasePath`/`setFileLoadErrorHandler`/
// `getFileLoadErrorHandler` builder augmentations.
//
// The augmentation is registered against the shared IConfigurationBuilder
// token, so it reaches BOTH decorated builders (ConfigurationBuilder and
// ConfigurationManager). Its members are merged onto three declaration spaces:
// the config.core IConfigurationBuilder INTERFACE (so a source's
// `ensureDefaults`, which only sees the interface, can call
// `builder.getFileProvider()`), and the two concrete classes (so user code
// reaches `setBasePath` etc. on a ConfigurationBuilder/ConfigurationManager).
//
// A consumer who only wants the augmentation needs a bare side-effect import:
// `import "@rhombus-std/config.file";`. `sideEffects: true` in package.json
// keeps a bundler from tree-shaking the registration away.

import type { ConfigurationBuilder } from '@rhombus-std/config';
import type { IConfigurationBuilder, IndexedSection } from '@rhombus-std/config.core';
import type { IFileProvider } from '@rhombus-std/fileproviders.core';
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import { type AugmentationSet, process, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { FileLoadErrorContext } from './FileLoadErrorContext';

// The `builder.properties` keys the default file provider and load-error
// handler are stashed under. Kept as the reference's literal strings so the
// property bag stays interoperable across every file-config package -- note
// the handler key still reads "Exception" (a cross-package data key, not a
// member name; the member and type use "error" per the naming convention).
const FILE_PROVIDER_KEY = 'FileProvider';
const FILE_LOAD_ERROR_HANDLER_KEY = 'FileLoadExceptionHandler';

/** The load-error-handler callback stashed on the builder. */
type FileLoadErrorHandler = Func<[FileLoadErrorContext], void>;

// Interface-side merge onto config.core's IConfigurationBuilder (the public
// barrel -- config.file doesn't own the interface, §38): gives the interface
// the file-default hooks a FileConfigurationSource.ensureDefaults calls
// through the plain IConfigurationBuilder type.
declare module '@rhombus-std/config.core' {
  interface IConfigurationBuilder {
    /** Sets the default file provider for file-based sources. */
    setFileProvider(fileProvider: IFileProvider): this;
    /** Gets the default file provider (a cwd-rooted PhysicalFileProvider when unset). */
    getFileProvider(): IFileProvider;
    /** Roots the default file provider at `basePath`. */
    setBasePath(basePath: string): this;
    /** Sets the default action invoked when a file-based source's load throws. */
    setFileLoadErrorHandler(handler: FileLoadErrorHandler): this;
    /** Gets the default file-load-error handler, if any. */
    getFileLoadErrorHandler(): FileLoadErrorHandler | undefined;
  }
}

// Class-side merges onto the two concrete builders via the config barrel
// (config is dist-referenced, so its flat dist/index.d.ts declares both classes
// directly -- a barrel merge lands cleanly even with other provider
// augmentations present; see config.json's addJsonFile install), so
// `new ConfigurationManager().setBasePath('/x')` type-checks against the
// prototype methods the registry installs.
declare module '@rhombus-std/config' {
  interface ConfigurationBuilder<T = IndexedSection> {
    setFileProvider(fileProvider: IFileProvider): this;
    getFileProvider(): IFileProvider;
    setBasePath(basePath: string): this;
    setFileLoadErrorHandler(handler: FileLoadErrorHandler): this;
    getFileLoadErrorHandler(): FileLoadErrorHandler | undefined;
  }
}

declare module '@rhombus-std/config' {
  interface ConfigurationManager {
    setFileProvider(fileProvider: IFileProvider): this;
    getFileProvider(): IFileProvider;
    setBasePath(basePath: string): this;
    setFileLoadErrorHandler(handler: FileLoadErrorHandler): this;
    getFileLoadErrorHandler(): FileLoadErrorHandler | undefined;
  }
}

/**
 * One named object literal mirroring the reference `FileConfigurationExtensions`
 * static class (docs §28/§38): receiver-first members over IConfigurationBuilder,
 * registered against the shared token AND exported as the standalone form.
 */
export const FileConfigurationExtensions = {
  setFileProvider(builder: IConfigurationBuilder, fileProvider: IFileProvider): IConfigurationBuilder {
    builder.properties.set(FILE_PROVIDER_KEY, fileProvider);
    return builder;
  },
  getFileProvider(builder: IConfigurationBuilder): IFileProvider {
    const provider = builder.properties.get(FILE_PROVIDER_KEY);
    if (provider !== undefined) {
      return provider as IFileProvider;
    }
    // The AppContext.BaseDirectory analog: a physical provider rooted at cwd.
    return new PhysicalFileProvider(process.cwd());
  },
  setBasePath(builder: IConfigurationBuilder, basePath: string): IConfigurationBuilder {
    return FileConfigurationExtensions.setFileProvider(builder, new PhysicalFileProvider(basePath));
  },
  setFileLoadErrorHandler(builder: IConfigurationBuilder, handler: FileLoadErrorHandler): IConfigurationBuilder {
    builder.properties.set(FILE_LOAD_ERROR_HANDLER_KEY, handler);
    return builder;
  },
  getFileLoadErrorHandler(builder: IConfigurationBuilder): FileLoadErrorHandler | undefined {
    return builder.properties.get(FILE_LOAD_ERROR_HANDLER_KEY) as FileLoadErrorHandler | undefined;
  },
} satisfies AugmentationSet<IConfigurationBuilder>;

registerAugmentations(nameof<IConfigurationBuilder>(), FileConfigurationExtensions);

export { FormatError, InvalidDataError } from './errors';
export { FileConfigurationProvider } from './FileConfigurationProvider';
export { FileConfigurationSource } from './FileConfigurationSource';
export type { FileLoadErrorContext } from './FileLoadErrorContext';

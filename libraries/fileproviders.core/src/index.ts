// Public entry point for @rhombus-std/fileproviders.core -- the read-only file
// provider abstractions ported from ME.FileProviders.Abstractions: the three
// interfaces (IFileProvider/IFileInfo/IDirectoryContents) and the null-object
// helpers ME ships alongside them.
//
// ME.FileProviders.Abstractions defines NO extension methods against these
// interfaces (no *Extensions type in its src), so none are ported here.

export type { IDirectoryContents } from './IDirectoryContents.js';
export type { IFileInfo } from './IFileInfo.js';
export type { IFileProvider } from './IFileProvider.js';
export { NotFoundDirectoryContents } from './NotFoundDirectoryContents.js';
export { NotFoundFileInfo } from './NotFoundFileInfo.js';
export { NullChangeToken } from './NullChangeToken.js';
export { NullFileProvider } from './NullFileProvider.js';

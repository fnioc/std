// Public entry point for @rhombus-std/fileproviders.core -- the read-only file
// provider abstractions ported from ME.FileProviders.Abstractions: the three
// interfaces (IFileProvider/IFileInfo/IDirectoryContents) and the null-object
// helpers ME ships alongside them.
//
// ME.FileProviders.Abstractions defines NO extension methods against these
// interfaces (no *Extensions type in its src), so none are ported here.

export type { IDirectoryContents } from "./directory-contents.js";
export type { IFileInfo } from "./file-info.js";
export type { IFileProvider } from "./file-provider.js";
export { NotFoundDirectoryContents } from "./not-found-directory-contents.js";
export { NotFoundFileInfo } from "./not-found-file-info.js";
export { NullChangeToken } from "./null-change-token.js";
export { NullFileProvider } from "./null-file-provider.js";

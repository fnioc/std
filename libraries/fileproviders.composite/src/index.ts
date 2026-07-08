// Public entry point for @rhombus-std/fileproviders.composite -- the composite
// file provider ported from ME.FileProviders.Composite: fold several
// IFileProvider instances into one, trying each in registration order.

export { CompositeDirectoryContents } from "./composite-directory-contents.js";
export { CompositeFileProvider } from "./composite-file-provider.js";

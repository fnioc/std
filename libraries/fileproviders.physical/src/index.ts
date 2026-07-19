// Public entry point for @rhombus-std/fileproviders.physical -- the disk-backed
// file provider ported from ME.FileProviders.Physical: PhysicalFileProvider
// serves files/directories off the on-disk file system and watches exact files
// and directory prefixes for changes. PhysicalFilesWatcher and
// PollingFileChangeToken stay internal (reached via the internal/* subpath for
// white-box tests), as the reference exposes them but no consumer needs them.

// Wholesale re-export of this family's own core (types AND the runtime
// null-object helpers consumers extend), so a consumer depending on the runtime
// package resolves the abstractions from it too; the package's public surface
// stays a superset of its core's.
export * from '@rhombus-std/fileproviders.core';

export { ExclusionFilters } from './ExclusionFilters.js';
export { PhysicalDirectoryContents } from './PhysicalDirectoryContents.js';
export { PhysicalDirectoryInfo } from './PhysicalDirectoryInfo.js';
export { PhysicalFileInfo } from './PhysicalFileInfo.js';
export { PhysicalFileProvider } from './PhysicalFileProvider.js';

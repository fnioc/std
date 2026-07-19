// Public entry point for @rhombus-std/fileproviders.composite -- the composite
// file provider that folds several IFileProvider instances into one, trying
// each in registration order.

// Wholesale re-export of this family's own core (types AND the runtime
// null-object helpers consumers extend), so a consumer depending on the runtime
// package resolves the abstractions from it too; the package's public surface
// stays a superset of its core's.
export * from '@rhombus-std/fileproviders.core';

export { CompositeDirectoryContents } from './CompositeDirectoryContents.js';
export { CompositeFileProvider } from './CompositeFileProvider.js';

// Build @rhombus-std/fileproviders.core for publication.
//
// Unlike config.core, this .core ships REAL runtime -- the null-object helpers
// (NotFoundFileInfo, NotFoundDirectoryContents, NullFileProvider,
// NullChangeToken) are classes, mirroring ME.FileProviders.Abstractions, which
// likewise carries these concrete types in its Abstractions assembly. So it
// follows the @rhombus-std/options build shape (real JS bundle), not the
// types-only config.core shape.
//
// @rhombus-std/primitives stays EXTERNAL: NullChangeToken returns an
// IChangeToken and consumers compare it by identity, so a private inlined copy
// of primitives would give it a different IChangeToken lineage than the one
// this package was built against.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/fileproviders.core",
  external: ["@rhombus-std/primitives"],
});

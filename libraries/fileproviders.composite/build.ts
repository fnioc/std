// Build @rhombus-std/fileproviders.composite for publication.
//
// Both runtime deps stay EXTERNAL:
//   - fileproviders.core -- CompositeFileProvider constructs NotFoundFileInfo
//     and compares tokens with `instanceof NullChangeToken`; a privately
//     inlined copy would give those a different lineage than the one a consumer
//     holds, breaking identity checks.
//   - primitives -- the IChangeToken contract flows through Watch by identity.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/fileproviders.composite",
  external: ["@rhombus-std/fileproviders.core", "@rhombus-std/primitives"],
});

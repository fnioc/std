// Build @rhombus-std/options for publication.
//
// @rhombus-std/primitives stays EXTERNAL: it's a runtime dependency (backs
// `subscribe` via ChangeToken.onChange), and a private inlined copy would
// give a consumer's own CancellationChangeToken a different IChangeToken
// identity than the one options was built against.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/options",
  external: ["@rhombus-std/primitives"],
});

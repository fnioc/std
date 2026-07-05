// Build @rhombus-std/primitives for publication.
//
// primitives is a leaf package -- zero workspace dependencies -- so the
// default buildPackage() options apply unmodified: bundle src/index.ts into
// dist/index.js and roll the public type surface into dist/index.d.ts.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/primitives",
});

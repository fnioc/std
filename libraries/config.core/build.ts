// Build @rhombus-std/config.core for publication.
//
// core is a PURE-TYPES package -- it ships ZERO runtime. The only artifact is a
// single self-contained dist/index.d.ts (rollup-plugin-dts). emitJs is false
// and assertNoJs guards the zero-runtime invariant: nothing imports core at
// runtime (every consumer uses `import type`), so a dist/index.js would
// contradict what this build asserts.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/config.core",
  emitJs: false,
  assertNoJs: true,
});

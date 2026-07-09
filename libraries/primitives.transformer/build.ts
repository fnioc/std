// Build @rhombus-std/primitives.transformer for publication.
//
// The transformer runs at COMPILE time inside ts-patch; `typescript` is its only
// peer dep and stays EXTERNAL. Its source imports only the type-only
// @rhombus-toolkit/func (which erases) and `typescript`, so the bundled runtime
// carries no @rhombus-std imports.
//
//   1. dist/index.js   — `bun build`, ESM, node target, `typescript` external.
//   2. dist/index.d.ts — rollup-plugin-dts rollup, `typescript` external.

import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/primitives.transformer",
  external: ["typescript"],
});

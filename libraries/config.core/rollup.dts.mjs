// Rolls the public type surface of @rhombus-std/config.core into a single dist/index.d.ts.
// The per-type source files cross-reference each other (relative imports), which
// rollup-plugin-dts inlines into the one flattened declaration; the only import that
// survives into the published output is the external `@rhombus-std/primitives` type.
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig, so
// extensionless relative specifiers resolve through `moduleResolution: bundler`.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dts } from "rollup-plugin-dts";

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, "src", "index.ts"),
  output: { file: join(PKG_ROOT, "dist", "index.d.ts"), format: "es" },
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, "tsconfig.json"),
      respectExternal: true,
    }),
  ],
};

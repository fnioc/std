// Rolls the public type surface of @rhombus-std/primitives into a single
// dist/index.d.ts. No `external` entries -- primitives is a leaf with zero
// workspace dependencies to keep out of the bundle.

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
    }),
  ],
};

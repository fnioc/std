// Rolls the public type surface of @rhombus-std/logging into a single
// dist/index.d.ts. @rhombus-std/di.core and @rhombus-std/logging.core stay
// EXTERNAL (respectExternal) so the published declaration imports their types
// rather than inlining private copies; @rhombus-toolkit/func is inlined.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dts } from "rollup-plugin-dts";

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, "src", "index.ts"),
  output: { file: join(PKG_ROOT, "dist", "index.d.ts"), format: "es" },
  external: [/^@rhombus-std\/di\.core$/, /^@rhombus-std\/logging\.core$/],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, "tsconfig.json"),
      respectExternal: true,
    }),
  ],
};

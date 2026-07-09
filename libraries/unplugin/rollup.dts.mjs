// Rolls the public type surface of @rhombus-std/unplugin into a single
// dist/index.d.ts. `typescript`, `unplugin`, and every `@rhombus-std/*` /
// `@rhombus-toolkit/*` workspace package stay external (re-exported FROM their
// declaring module, not inlined) — the same runtime/module-identity rationale as
// the JS bundle (docs/decisions.md §9/§38).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dts } from "rollup-plugin-dts";

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, "src", "index.ts"),
  output: { file: join(PKG_ROOT, "dist", "index.d.ts"), format: "es" },
  external: [/^typescript$/, /^unplugin$/, /^@rhombus-std\//, /^@rhombus-toolkit\//],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, "tsconfig.json"),
      respectExternal: true,
    }),
  ],
};

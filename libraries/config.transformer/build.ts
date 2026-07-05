// Build @rhombus-std/config.transformer for publication.
//
// `typescript` stays EXTERNAL (it's a peer dep — ts-patch supplies the same
// TypeScript instance at runtime). src/ imports nothing from @rhombus-std/config.*, so
// the runtime bundle must be @rhombus-std-free: the ONLY reference is the
// literal "@rhombus-std/config" string the transformer emits as the injected
// import specifier (codegen, not an ESM import). We assert that no actual
// `import … from "@rhombus-std/config…"` slips into the transformer's own runtime.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPackage } from "../../scripts/build-package";

await buildPackage({
  dir: import.meta.dir,
  name: "@rhombus-std/config.transformer",
  external: ["typescript"],
});

// Guard: the emitted bundle must carry no real ESM import from @rhombus-std/config*.
// The literal "@rhombus-std/config" (the injected import-specifier string) is
// expected and fine; an actual `import … from "@rhombus-std/config…"` is not.
const bundle = readFileSync(join(import.meta.dir, "dist", "index.js"), "utf8");
const realImport = /(^|\n)\s*import[^\n]*from\s*["']@rhombus-std\/config/;
if (realImport.test(bundle)) {
  throw new Error(
    "@rhombus-std/config.transformer: dist/index.js contains a real ESM import from @rhombus-std/config* — "
      + "the runtime bundle must be @rhombus-std-free (the only reference is the "
      + "injected import-specifier string).",
  );
}

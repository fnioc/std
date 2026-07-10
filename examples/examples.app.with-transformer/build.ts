// Build @rhombus-std/examples.app.with-transformer via the ttsc/Go engine.
//
// The with-transformer composition root: src/main.ts is authored in the
// tokenless dialect and needs BOTH the di.transformer (registration + tokenless
// resolve/resolveAsync) and its di.transformer.options (addOptions<T>) plugins to
// lower. This is the ttsc/Go analog of the former `tspc -p tsconfig.json` build:
// @ttsc/unplugin/bun runs the two Go plugins as onLoad transforms while Bun.build
// emits dist/main.js.
//
// Every workspace dependency stays EXTERNAL so main.js imports the SAME
// @rhombus-std/* runtime a published consumer would — the augmentation registry
// and container identity are load-bearing and must not be forked by an inlined
// copy. node/bun builtins are external under `target: "node"`.

import { rmSync } from "node:fs";
import { join } from "node:path";
import { ttscBunPlugin } from "../../scripts/build-package";

const dir = import.meta.dir;
const dist = join(dir, "dist");
rmSync(dist, { recursive: true, force: true });

const js = await Bun.build({
  entrypoints: [join(dir, "src/main.ts")],
  outdir: dist,
  target: "node",
  format: "esm",
  external: [
    "@rhombus-std/config",
    "@rhombus-std/di",
    "@rhombus-std/examples.contracts",
    "@rhombus-std/examples.lib.with-transformer",
    "@rhombus-std/examples.lib.without-transformer",
    "@rhombus-std/hosting",
    "@rhombus-std/logging",
    "@rhombus-std/logging.core",
    "@rhombus-std/options",
    "@rhombus-std/options.augmentations",
  ],
  // Pass the aggregate plugin EXPLICITLY: the app installs both di.transformer
  // and di.transformer.options (each carries a ttsc.plugin marker), which the
  // adapter would otherwise auto-register as two separate native backends — a
  // conflict. The one aggregate host runs both stages in a single pass.
  plugins: [
    await ttscBunPlugin(dir, "tsconfig.ttsc.json", ["@rhombus-std/di.transformer.options/ttsc-app"]),
  ],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error("examples.app.with-transformer: bun build failed");
}

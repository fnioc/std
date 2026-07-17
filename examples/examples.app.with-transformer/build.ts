// Build @rhombus-std/examples.app.with-transformer via the ttsc/Go engine.
//
// The with-transformer composition root: src/main.ts is authored in the
// tokenless dialect and needs BOTH the di.core preset bundle (registration sugar
// via inline -> nameof -> signatureof -> di, plus the di stage's addValue +
// tokenless resolve/resolveAsync + `.as<>` lowering) and its di.transformer.options
// (addOptions<T>) plugin to lower. This is the ttsc/Go analog of the former
// `tspc -p tsconfig.json` build: @ttsc/unplugin/bun runs the Go plugins as onLoad
// transforms while Bun.build emits dist/main.js.
//
// Every workspace dependency stays EXTERNAL so main.js imports the SAME
// @rhombus-std/* runtime a published consumer would — the augmentation registry
// and container identity are load-bearing and must not be forked by an inlined
// copy. node/bun builtins are external under `target: "node"`.

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readTsconfigTransforms, ttscBunPlugin } from '../../scripts/build-package';

const dir = import.meta.dir;
const dist = join(dir, 'dist');
rmSync(dist, { recursive: true, force: true });

// Thread the tsconfig.ttsc.json plugin list EXPLICITLY (di.core/ttsc — the
// preset bundle — and di.transformer.options/ttsc), suppressing the adapter's
// auto-discovery. Both resolve to the one owner host, which expands the bundle
// and runs each declared stage in canonical order.
const ttscTransforms = readTsconfigTransforms(dir, 'tsconfig.ttsc.json');

const js = await Bun.build({
  entrypoints: [join(dir, 'src/main.ts')],
  outdir: dist,
  target: 'node',
  format: 'esm',
  external: [
    '@rhombus-std/config',
    '@rhombus-std/di',
    '@rhombus-std/examples.contracts',
    '@rhombus-std/examples.lib.with-transformer',
    '@rhombus-std/examples.lib.without-transformer',
    '@rhombus-std/hosting',
    '@rhombus-std/logging',
    '@rhombus-std/logging.core',
    '@rhombus-std/options',
    '@rhombus-std/options.augmentations',
  ],
  // Pass the plugins EXPLICITLY: the app installs the di.core preset bundle and
  // di.transformer.options; passing the declared list suppresses the adapter's
  // auto-discovery. Both descriptors resolve to the one owner host, which ttsc
  // dedupes to a single spawn.
  plugins: [
    await ttscBunPlugin(dir, 'tsconfig.ttsc.json', ttscTransforms),
  ],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error('examples.app.with-transformer: bun build failed');
}

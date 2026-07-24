// Build @rhombus-std/examples.app.with-transformer via the ttsc/Go engine.
//
// The with-transformer composition root: src/main.ts is authored in the
// tokenless dialect. Every tokenless form — add/addFactory/addValue,
// resolve/resolveAsync/tryResolve/isService, the trailing `.as<>()`, and
// addOptions<T>() — lowers through the ONE always-on engine: the generic inline
// stage substitutes each sugar body (from di.extras / di.extras.options), then
// the primitive stages (nameof/signatureof/keyof/valueof/mergesynth) peel the
// resulting tokenfor/signatureof/keyof/valueof calls under the fixed-point loop.
// There are no bespoke di / di_options / config stages any more (W6p3 deleted
// them). This is the ttsc/Go analog of the former per-file transformer build:
// @ttsc/unplugin/bun runs the Go plugins as onLoad transforms while Bun.build
// emits dist/main.js.
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

// Stage selection is declare-by-depending, resolved HOST-SIDE (§100): with no
// tsconfig.ttsc.json plugins array, @ttsc/unplugin/bun's auto-discovery spawns the
// one owner host from this app's direct *.extras devDeps (di.extras +
// di.extras.options), and the host runs its whole always-on stage table
// — the generic inline stage plus the primitive stages reached through their
// primitives.extras dep — from its own dependency scan. Compute the override:
// a non-empty manual plugins array wins; otherwise `undefined` (NEVER [], which
// would suppress discovery and never spawn the host).
const manual = readTsconfigTransforms(dir, 'tsconfig.ttsc.json');
const ttscTransforms = manual.length > 0 ? manual : undefined;

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
  // ttscTransforms is undefined by default, so @ttsc/unplugin/bun runs its
  // auto-discovery — spawning the one owner host from the app's direct
  // *.extras deps, which ttsc dedupes to a single spawn. The host then
  // self-selects the transitive stage union from its own dependency scan.
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

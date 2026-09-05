// Build @rhombus-std/examples.app.with-transformer via the ttsc/Go engine.
//
// The with-transformer composition root: its src is authored in the type-driven
// dialect, where every service Type — registered, looked up, or published — is
// minted by `typefor<T>()`. It is a primitive the Go engine folds at build time,
// in two passes: a per-file STAGE lowers each src file in isolation (and the
// engine writes the generated `Type` consts a call site references into the same
// stage directory), then a plugin-free BUNDLE pass folds that emit into
// dist/main.js. So what ships is exactly what the without-transformer twin wrote
// out by hand.
//
// Every workspace dependency stays EXTERNAL so main.js imports the SAME
// @rhombus-std/* runtime a published consumer would — the augmentation registry
// and container identity are load-bearing and must not be forked by an inlined
// copy. node/bun builtins are external under `target: "node"`.

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readTsconfigTransforms, stagedEntrypoint, stageLowering } from '../../scripts/build-package';

const dir = import.meta.dir;
const dist = join(dir, 'dist');
rmSync(dist, { recursive: true, force: true });

// Stage selection is declare-by-depending, resolved HOST-SIDE: with no
// tsconfig.ttsc.json plugins array, @ttsc/unplugin/bun's auto-discovery spawns
// the one owner host from this app's direct *.extras devDeps, and the host runs
// its whole always-on stage table from its own dependency scan. Compute the
// override: a non-empty manual plugins array wins; otherwise `undefined` (NEVER
// [], which would suppress discovery and never spawn the host).
const manual = readTsconfigTransforms(dir, 'tsconfig.ttsc.json');
const ttscTransforms = manual.length > 0 ? manual : undefined;

const stageDir = await stageLowering({ dir, name: 'examples.app.with-transformer', ttscProject: 'tsconfig.ttsc.json', ttscTransforms });

const js = await Bun.build({
  entrypoints: [stagedEntrypoint(stageDir, 'src/main.ts')],
  outdir: dist,
  target: 'node',
  format: 'esm',
  sourcemap: 'linked',
  external: [
    '@rhombus-std/config',
    '@rhombus-std/di',
    '@rhombus-std/di.core',
    '@rhombus-std/examples.contracts',
    '@rhombus-std/examples.lib.with-transformer',
    '@rhombus-std/examples.lib.without-transformer',
    '@rhombus-std/hosting',
    '@rhombus-std/logging',
    '@rhombus-std/logging.core',
    '@rhombus-std/options',
    '@rhombus-std/options.augmentations',
    // `typefor<T>()` folds to a `Type` EXPRESSION, so the lowered output imports
    // @rhombus-std/primitives at run time even though nothing in the authored
    // source names it. Inlining it would fork the `Type` intern table, and this
    // app's whole point is that a derived type and a hand-composed one are the
    // same object.
    '@rhombus-std/primitives',
  ],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error('examples.app.with-transformer: bun build failed');
}

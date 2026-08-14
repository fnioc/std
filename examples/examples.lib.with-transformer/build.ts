// Build @rhombus-std/examples.lib.with-transformer via the ttsc/Go engine.
//
// This example library is authored in the tokenless di dialect and consumed
// only as its BUILD (every exports condition resolves to dist), so the
// transformer MUST run: the tokenless registration forms and the typefor<T>()
// calls in types.ts and infrastructure-greeting-workshop.ts — naming service
// types and dependency slots, including inside `Type.func(..., [[]])` — all have to
// be lowered before anything can execute. The Go engine runs during the
// Bun.build emit:
//
//   - dist/*.js  — a per-file STAGE runs @ttsc/unplugin/bun over each src file in
//     isolation, lowering every tokenless call to its explicit `Type` (and
//     writing the generated consts a hoisted call site references into the same
//     stage directory); a plugin-free Bun.build then bundles that emit into the
//     barrel. The workspace runtime deps stay EXTERNAL — a consumer resolves the
//     same @rhombus-std/di.core identity at runtime, never a bundled copy, which
//     is what keeps the augmentation installs and the error taxonomy shared.
//   - dist/index.d.ts — the clean authored surface, emitted by plain tsc
//     (typescript 5). The lowered calls are real di.core methods with no
//     type-level footprint, so the d.ts is identical with or without lowering.

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readTsconfigTransforms, stagedEntrypoint, stageLowering } from '../../scripts/build-package';

const dir = import.meta.dir;
const dist = join(dir, 'dist');
rmSync(dist, { recursive: true, force: true });

const dts = spawnSync('bun', ['x', 'tsc', '-p', 'tsconfig.json', '--emitDeclarationOnly', '--declaration', '--outDir',
  'dist'], { cwd: dir, stdio: 'inherit' });
if (dts.status !== 0) {
  throw new Error('examples.lib.with-transformer: d.ts emit failed');
}

// Stage selection is declare-by-depending, resolved HOST-SIDE (§100): with no
// tsconfig.ttsc.json plugins array, auto-discovery spawns the one owner host from
// this lib's direct di.extras devDep, and the host self-selects the full
// stage set (the generic inline stage plus the primitive stages via di.extras's
// primitives.extras dep) from its own dependency scan. Pass `undefined`
// (NEVER []) so discovery is not suppressed; a non-empty manual plugins array
// would override.
const manual = readTsconfigTransforms(dir, 'tsconfig.ttsc.json');
const ttscTransforms = manual.length > 0 ? manual : undefined;

// ttscTransforms is undefined, so @ttsc/unplugin/bun runs auto-discovery (the
// one owner host, deduped to a single spawn); the host self-selects the stages.
const stageDir = await stageLowering({ dir, name: 'examples.lib.with-transformer', ttscProject: 'tsconfig.ttsc.json',
  ttscTransforms });

const js = await Bun.build({
  entrypoints: [stagedEntrypoint(stageDir, 'src/index.ts')],
  outdir: dist,
  target: 'node',
  format: 'esm',
  external: ['@rhombus-std/di.core', '@rhombus-std/options', '@rhombus-std/examples.contracts',
    '@rhombus-std/primitives'],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error('examples.lib.with-transformer: bun build failed');
}

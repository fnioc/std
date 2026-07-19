// Build @rhombus-std/examples.lib.with-transformer via the ttsc/Go engine.
//
// This example library is authored in the tokenless di dialect and consumed
// only as its BUILD (every exports condition resolves to dist), so the
// transformer MUST run to lower the resolve<T>()/tryResolve<T>()/isService<T>()
// calls in server-report.ts. The Go engine runs during the Bun.build emit:
//
//   - dist/*.js  — Bun.build bundles the barrel, with @ttsc/unplugin/bun running
//     the di.transformer Go plugin as an onLoad transform so each tokenless call
//     is lowered to its string token as Bun emits. The workspace runtime deps
//     stay EXTERNAL — a consumer resolves the same @rhombus-std/di identity at
//     runtime, never a bundled copy.
//   - dist/index.d.ts — the clean authored surface, emitted by plain tsc
//     (typescript 5). The lowered calls are real di.core methods with no
//     type-level footprint, so the d.ts is identical with or without lowering.

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readTsconfigTransforms, ttscBunPlugin } from '../../scripts/build-package';

const dir = import.meta.dir;
const dist = join(dir, 'dist');
rmSync(dist, { recursive: true, force: true });

const dts = spawnSync(
  'bun',
  ['x', 'tsc', '-p', 'tsconfig.json', '--emitDeclarationOnly', '--declaration', '--outDir', 'dist'],
  { cwd: dir, stdio: 'inherit' },
);
if (dts.status !== 0) {
  throw new Error('examples.lib.with-transformer: d.ts emit failed');
}

const js = await Bun.build({
  entrypoints: [join(dir, 'src/index.ts')],
  outdir: dist,
  target: 'node',
  format: 'esm',
  external: ['@rhombus-std/di', '@rhombus-std/options', '@rhombus-std/examples.contracts'],
  // Thread the declared tsconfig.ttsc.json plugin (di.transformer/ttsc)
  // EXPLICITLY, suppressing the adapter's install-set auto-discovery.
  plugins: [await ttscBunPlugin(dir, 'tsconfig.ttsc.json', readTsconfigTransforms(dir, 'tsconfig.ttsc.json'))],
});
if (!js.success) {
  for (const log of js.logs) {
    console.error(log);
  }
  throw new Error('examples.lib.with-transformer: bun build failed');
}

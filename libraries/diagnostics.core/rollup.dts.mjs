// Rolls the public type surface of @rhombus-std/diagnostics.core into a single
// dist/index.d.ts. The workspace/toolkit type dependencies stay EXTERNAL
// (respectExternal: true) so the published declaration imports `IServiceManifestBase`
// / `Token` / `ConfigureOptions` / `Func` from their real packages rather than
// inlining a private copy.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'index.d.ts'), format: 'es' },
  external: [
    /^@rhombus-std\/di\.core$/,
    /^@rhombus-std\/options$/,
    /^@rhombus-std\/primitives$/,
    /^@rhombus-std\/primitives\.transformer(\/|$)/,
    /^@rhombus-toolkit\/func$/,
  ],
  plugins: [
    dts({
      tsconfig: join(PKG_ROOT, 'tsconfig.json'),
      respectExternal: true,
    }),
  ],
};

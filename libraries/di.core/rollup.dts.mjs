// Rolls the public type surface of @rhombus-std/di.core into dist/bundle/index.d.ts, and the
// registration chain reached through the ./builders subpath into dist/bundle/builder.d.ts.
// The type-only @rhombus-toolkit/types imports are inlined (respectExternal) so the
// published declaration has no external import and core ships with zero deps.
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig,
// so NodeNext `.js` specifiers resolve to the `.ts` sources.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

// Preserve `@rhombus-std/primitives` as an external import so `Type` keeps ONE identity across
// the graph. An inlined copy carries its own `unique symbol` brand, which no other copy's node
// can satisfy, so the two spellings of one type stop being assignable to each other.
const PRIMITIVES = [/^@rhombus-std\/primitives$/];

const BUILDERS_MODULE = join(PKG_ROOT, 'src', 'builder');
const BUILDERS_SPECIFIER = '@rhombus-std/di.core/builders';

/**
 * Sends every in-package import of the chain module out to the ./builders subpath the chain also
 * publishes under. The two rolls would otherwise each declare their own `IAsImplementer`, and a
 * registration-authoring package augments the subpath's — leaving the one the root's
 * `RegistrationBuilderFor` reads unmerged, so the sugar would never reach a caller.
 */
const buildersSubpath = {
  name: 'builders-subpath',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) {
      return null;
    }
    if (resolve(dirname(importer), source) !== BUILDERS_MODULE) {
      return null;
    }
    return { id: BUILDERS_SPECIFIER, external: true };
  },
};

export default [
  {
    input: join(PKG_ROOT, 'src', 'index.ts'),
    output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
    external: PRIMITIVES,
    plugins: [buildersSubpath, dts({ tsconfig: join(PKG_ROOT, 'tsconfig.json'), respectExternal: true })],
  },
  {
    input: `${BUILDERS_MODULE}.ts`,
    output: { file: join(PKG_ROOT, 'dist', 'bundle', 'builder.d.ts'), format: 'es' },
    external: PRIMITIVES,
    plugins: [dts({ tsconfig: join(PKG_ROOT, 'tsconfig.json'), respectExternal: true })],
  },
];

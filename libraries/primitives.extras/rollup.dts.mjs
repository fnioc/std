// Rolls the public type surface of @rhombus-std/primitives.extras into a
// single dist/bundle/index.d.ts — the authoring-only token-grammar predicate
// stubs and `typefor`, whose return type comes from `Type`.
// rollup-plugin-dts drives the TypeScript compiler with this package's tsconfig,
// so extensionless relative specifiers resolve through `moduleResolution: bundler`.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dts } from 'rollup-plugin-dts';

const PKG_ROOT = dirname(fileURLToPath(import.meta.url));

export default {
  input: join(PKG_ROOT, 'src', 'index.ts'),
  output: { file: join(PKG_ROOT, 'dist', 'bundle', 'index.d.ts'), format: 'es' },
  // Preserve these as external imports so `Type` keeps ONE identity across the graph. An inlined
  // copy carries its own `unique symbol` brand, which no other copy's node can satisfy, so the two
  // spellings of one type stop being assignable to each other.
  external: [/^@rhombus-std\/primitives$/, /^@rhombus-toolkit\/func$/],
  plugins: [dts({ tsconfig: join(PKG_ROOT, 'tsconfig.json'), respectExternal: true })],
};

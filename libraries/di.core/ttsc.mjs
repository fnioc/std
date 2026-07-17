// @ts-check
// ttsc descriptor for di.core's primitive-stage BUNDLE (the transformer "preset").
//
// Unlike a *.transformer descriptor — which names a SINGLE stage — this returns
// the bundle name `rhombusstd_di_bundle`, which the single owner Go host
// (transforms/cmd/ttsc-std) expands into its ordered constituent set:
//   inline -> nameof -> signatureof -> di
// in canonical order. A consumer of di.core's type-driven `add<T>()` /
// `addFactory<T>()` sugar wires just this one descriptor (or merely depends on
// di.core, so stock ttsc auto-discovers this package's `ttsc` marker) instead of
// enumerating the four primitive stages by hand in the right order. The binary
// owns both the membership and the order — no consumer ever hand-lists them.
//
// The `source` resolves to the SAME owner host every @rhombus-std descriptor
// resolves to, so ttsc dedupes them to one cache key and one spawn.

import path from 'node:path';

/**
 * @param {import("ttsc").ITtscPluginFactoryContext} context
 * @returns {import("ttsc").ITtscPlugin}
 */
export function createTtscPlugin(context) {
  // context.dirname is the load-mode-independent __dirname of THIS descriptor
  // (libraries/di.core); the owner host lives at the repo root.
  const source = path.resolve(
    context.dirname,
    '..',
    '..',
    'transforms',
    'cmd',
    'ttsc-std',
  );
  return { name: 'rhombusstd_di_bundle', source };
}

export default createTtscPlugin;

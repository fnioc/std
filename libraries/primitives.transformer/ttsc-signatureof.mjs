// @ts-check
// ttsc descriptor for the signatureof primitive stage. It resolves to the SAME
// owner Go host (transforms/cmd/ttsc-std) as every other @rhombus-std descriptor,
// differing only in the stage name it activates: `rhombusstd_signatureof`.
//
// A consumer selects this stage by adding
//   { "transform": "@rhombus-std/primitives.transformer/signatureof-ttsc" }
// to its tsconfig `plugins`. The host runs it in its canonical order (after
// nameof, before di) regardless of manifest order, so a substituted
// `signatureof(ctor)` lowers to its dependency-signature array before the di
// stage sees the fully-lowered registration call.
//
// signatureof is a Go-only primitive; there is no other engine to wire it against.

import path from 'node:path';

/**
 * @param {import("ttsc").ITtscPluginFactoryContext} context
 * @returns {import("ttsc").ITtscPlugin}
 */
export function createTtscPlugin(context) {
  const source = path.resolve(
    context.dirname,
    '..',
    '..',
    'transforms',
    'cmd',
    'ttsc-std',
  );
  return { name: 'rhombusstd_signatureof', source };
}

export default createTtscPlugin;

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
// The ts-patch entry (the `.` export's `transform`) is untouched: signatureof is
// a Go-only primitive (owner directive 2026-07-17, ts-patch dropped for new
// work), so there is no ts-patch twin descriptor to wire.

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

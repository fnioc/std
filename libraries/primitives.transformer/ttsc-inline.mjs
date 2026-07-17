// @ts-check
// ttsc descriptor for the generic single-expression INLINE stage. It resolves to
// the SAME owner Go host (transforms/cmd/ttsc-std) as every other @rhombus-std
// descriptor, differing only in the stage name it activates: `rhombusstd_inline`.
//
// A consumer selects this stage by adding
//   { "transform": "@rhombus-std/primitives.transformer/inline-ttsc" }
// to its tsconfig `plugins`, ahead of the other stage descriptors. The host runs
// the inline stage first in its canonical order regardless of manifest order.
//
// The ts-patch entry (the `.` export's `transform`) is untouched — the inline
// stage's ts-patch twin is a deferred follow-up; tspc-track consumers must NOT
// wire this descriptor until it exists.

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
  return { name: 'rhombusstd_inline', source };
}

export default createTtscPlugin;

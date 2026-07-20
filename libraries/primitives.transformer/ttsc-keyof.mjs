// @ts-check
// ttsc descriptor for the keyof primitive stage. It resolves to the SAME owner Go
// host (transforms/cmd/ttsc-std) as every other @rhombus-std descriptor, differing
// only in the stage name it activates: `rhombusstd_keyof`.
//
// A consumer selects this stage by adding
//   { "transform": "@rhombus-std/primitives.transformer/keyof-ttsc" }
// to its tsconfig `plugins`. The host runs it in its canonical order (after
// nameof/signatureof, before di) regardless of manifest order, so a substituted
// `keyof<T>()` lowers to its keyed-registration key string before the di stage
// sees the fully-lowered registration call.
//
// keyof is a Go-only primitive; there is no other engine to wire it against.

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
  return { name: 'rhombusstd_keyof', source };
}

export default createTtscPlugin;

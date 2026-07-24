// @ts-check
// ttsc descriptor for the addOptions<T>() sugar transform stage. ttsc loads this
// thin JS module, calls it with a factory context, and gets back the ABSOLUTE
// PATH to the single owner Go host (transforms/cmd/ttsc-std) plus a stage name;
// ttsc then compiles and runs that source as a sidecar with the local Go toolchain.
//
// Every @rhombus-std/*.transformer descriptor resolves to the SAME owner host, so
// ttsc dedupes them to one cache key and one spawn — a consumer that needs both
// the registration and options stages simply lists both `./ttsc` descriptors;
// the host runs each declared stage in canonical order (no aggregate descriptor
// needed, and none exists).
//
// This is the Go/ttsc emit path — the sole lowering engine now, wired through the
// `./ttsc` subpath.

import path from 'node:path';

/**
 * @param {import("ttsc").ITtscPluginFactoryContext} context
 * @returns {import("ttsc").ITtscPlugin}
 */
export function createTtscPlugin(context) {
  // context.dirname is the load-mode-independent __dirname of THIS descriptor
  // (libraries/di.transformer.options); the owner host lives at the repo root.
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

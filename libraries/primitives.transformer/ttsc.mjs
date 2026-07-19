// @ts-check
// ttsc descriptor for the nameof transform stage. ttsc loads this thin JS module,
// calls it with a factory context, and gets back the ABSOLUTE PATH to the single
// owner Go host (transforms/cmd/ttsc-std) plus a stage name; ttsc then compiles
// and runs that source as a sidecar with the local Go toolchain.
//
// Every @rhombus-std/*.transformer descriptor resolves to the SAME owner host, so
// ttsc dedupes them to one cache key and one spawn. The host activates only the
// declared stages, keyed off each descriptor's `rhombusstd_*` name.
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
  // (libraries/primitives.transformer); the owner host lives at the repo root.
  const source = path.resolve(
    context.dirname,
    '..',
    '..',
    'transforms',
    'cmd',
    'ttsc-std',
  );
  return { name: 'rhombusstd_nameof', source };
}

export default createTtscPlugin;

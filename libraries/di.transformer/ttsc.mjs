// @ts-check
// ttsc descriptor for the @rhombus-std owner transform host. ttsc loads this thin
// JS module, calls it with a factory context, and gets back the ABSOLUTE PATH to
// the single owner Go host (transforms/cmd/ttsc-std); ttsc then compiles and runs
// that source as a sidecar with the local Go toolchain.
//
// Every @rhombus-std descriptor resolves to the SAME owner host under the SAME
// name, so ttsc dedupes them to one cache key and one spawn. There is no stage
// selection (W7): a consumer that depends on this authoring package spawns the
// host, which runs its whole stage table; the sugar bodies in play come from the
// dependency scan, not the descriptor.
//
// This is the Go/ttsc emit path — the sole lowering engine — wired through the
// `./ttsc` subpath.

import path from 'node:path';

/**
 * @param {import("ttsc").ITtscPluginFactoryContext} context
 * @returns {import("ttsc").ITtscPlugin}
 */
export function createTtscPlugin(context) {
  // context.dirname is the load-mode-independent __dirname of THIS descriptor
  // (libraries/di.transformer); the owner host lives at the repo root.
  const source = path.resolve(
    context.dirname,
    '..',
    '..',
    'transforms',
    'cmd',
    'ttsc-std',
  );
  return { name: 'rhombusstd', source };
}

export default createTtscPlugin;

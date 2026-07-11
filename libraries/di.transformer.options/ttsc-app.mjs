// @ts-check
// ttsc descriptor for the AGGREGATE registration+options transform-stage plugin.
// ttsc runs a single native backend per source-to-source pass, so a consumer that
// needs BOTH the registration lowering (add/resolve/isService/nameof, from
// @rhombus-std/di.transformer) and the addOptions<T>() lowering (this package)
// cannot list the two `./ttsc` plugins side by side. This descriptor points at
// the one aggregate Go host (transforms/cmd/ttsc-di-app) that composes both stages
// over one program load — the tokens it emits are identical to the two standalone
// sidecars. An app's composition root wires this single plugin.
//
// The ts-patch path pairs the two `transform` plugins directly (ts-patch supports
// multiple transformers per program); only the ttsc/Go path needs this aggregate.

import path from 'node:path';

/**
 * @param {import("ttsc").ITtscPluginFactoryContext} context
 * @returns {import("ttsc").ITtscPlugin}
 */
export function createTtscPlugin(context) {
  // context.dirname is the load-mode-independent __dirname of THIS descriptor
  // (libraries/di.transformer.options); the Go plugin lives at the repo root.
  const source = path.resolve(
    context.dirname,
    '..',
    '..',
    'transforms',
    'cmd',
    'ttsc-di-app',
  );
  return { name: 'di-app', source };
}

export default createTtscPlugin;

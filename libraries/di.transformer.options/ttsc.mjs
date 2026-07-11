// @ts-check
// ttsc descriptor for the options-sugar transform-stage plugin. ttsc loads this
// thin JS module, calls it with a factory context, and gets back the ABSOLUTE
// PATH to the Go plugin package shipped in the monorepo's transforms/ tree; ttsc
// then compiles and runs that source as a sidecar with the local Go toolchain.
// This mirrors the canonical descriptor recipe: a JS shim whose only job is to
// point at Go source.
//
// The existing ts-patch entry (the `.` export's `transform`) is untouched — this
// is the parallel ttsc/Go emit path, wired through the separate `./ttsc` subpath.
// This descriptor lowers addOptions<T>() ONLY. ttsc runs a single native backend
// per pass, so it CANNOT be listed alongside the registration `./ttsc` plugin — a
// consumer that needs both wires the aggregate `./ttsc-app` descriptor instead.

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
    'ttsc-di-options',
  );
  return { name: 'di-options', source };
}

export default createTtscPlugin;

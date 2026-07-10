// @ts-check
// ttsc descriptor for the nameof transform-stage plugin. ttsc loads this thin JS
// module, calls it with a factory context, and gets back the ABSOLUTE PATH to the
// Go plugin package shipped in the monorepo's transforms/ tree; ttsc then compiles
// and runs that source as a sidecar with the local Go toolchain. This mirrors the
// canonical descriptor recipe: a JS shim whose only job is to point at Go source.
//
// The existing ts-patch entry (the `.` export's `transform`) is untouched — this
// is the parallel ttsc/Go emit path, wired through the separate `./ttsc` subpath.

import path from "node:path";

/**
 * @param {import("ttsc").ITtscPluginFactoryContext} context
 * @returns {import("ttsc").ITtscPlugin}
 */
export function createTtscPlugin(context) {
  // context.dirname is the load-mode-independent __dirname of THIS descriptor
  // (libraries/primitives.transformer); the Go plugin lives at the repo root.
  const source = path.resolve(
    context.dirname,
    "..",
    "..",
    "transforms",
    "cmd",
    "ttsc-nameof",
  );
  return { name: "nameof", source };
}

export default createTtscPlugin;

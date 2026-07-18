// @ts-check
// ttsc descriptor for the nameof transform stage ON THE IN-REPO-ONLY FULL HOST
// (transforms/cmd/ttsc-std-full) — the ttsc-std sibling that additionally links
// the typia-embedding merge-synthesis stage (#213, §87). ttsc keys its plugin
// cache on the resolved source directory, so every stage a full-host consumer
// wires must resolve HERE: mixing this descriptor with a plain `./ttsc`-family
// one in the same tsconfig is two owner binaries in one pass, which ttsc
// rejects loudly.
//
// Exported at the publish-scrubbed `./private/full-ttsc` subpath: augmentation
// authoring is first-party-only, so no published consumer ever needs the
// typia-bearing host — published descriptors keep resolving to the typia-free
// ttsc-std.

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
    'ttsc-std-full',
  );
  return { name: 'rhombusstd_nameof', source };
}

export default createTtscPlugin;

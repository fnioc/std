// @ts-check
// ttsc descriptor for the #213 merge-strategy synthesis stage
// (`rhombusstd_mergesynth`): typia-generated default merge strategies for every
// augmentation member reaching `registerAugmentations` / `applyAugmentations`,
// threaded as the call's third argument so a member-name collision dispatches
// by argument shape instead of throwing.
//
// The stage exists ONLY in the in-repo-only full host
// (transforms/cmd/ttsc-std-full) — the typia embed never rides the published
// ttsc-std (§87). Wire it together with `./private/full-ttsc` (and any other
// full-host stage twins): all of one consumer's stages must resolve to the
// same owner source, and this one resolves to the full host. Exported at the
// publish-scrubbed `./private/mergesynth-ttsc` subpath; there is deliberately no
// ts-patch twin — typia dropped ts-patch support, so the lint/typecheck track
// simply lacks this stage (emit-only sugar, no type-level footprint).

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
  return { name: 'rhombusstd_mergesynth', source };
}

export default createTtscPlugin;

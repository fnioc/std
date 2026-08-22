/**
 * The duplicate-copy guard. Cross-package behavior here rides on module
 * identity — the augmentation registry's state, the prototypes augmentations
 * install onto — so a second loaded copy of a guarded package forks that state
 * and misbehaves far from the cause. A guarded package's entry module calls
 * {@link stampSingleInstance} at load: the first call records which copy
 * loaded, and a genuinely different copy fails fast instead.
 */

/**
 * Claims the process-wide instance slot for `packageName`, or throws when a
 * different copy of the package already holds it.
 *
 * @remarks
 * The slot is `globalThis[Symbol.for(packageName + '/instance')]`, holding the
 * module URL of the copy that loaded first. A repeat call with the same URL is
 * a re-evaluation of that copy and stays silent; a call with a different URL
 * is a second copy and throws, leaving the original stamp in place.
 */
export function stampSingleInstance(packageName: string, moduleUrl: string): void {
  const slot = Symbol.for(`${packageName}/instance`);
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const existing = globals[slot];
  if (existing === undefined) {
    globals[slot] = moduleUrl;
    return;
  }
  if (existing === moduleUrl) {
    return;
  }
  throw new Error(
    `Two copies of ${packageName} are loaded in one process: ${String(existing)} (loaded first) and `
      + `${moduleUrl}. A second copy forks per-module state (the augmentation registry, class identity), `
      + `breaking cross-package behavior far from the cause. Deduplicate the dependency graph so exactly `
      + `one copy of ${packageName} resolves.`,
  );
}

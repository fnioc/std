/**
 * The duplicate-copy guard. Cross-package behavior here rides on module
 * identity — the augmentation registry's state, the prototypes augmentations
 * install onto — so a second loaded copy of a guarded package forks that state
 * and misbehaves far from the cause. A guarded package's entry module calls
 * {@link stampSingleInstance} at load: the first call records which copy
 * loaded, and a genuinely different copy fails fast instead.
 */

/**
 * Call once at the top of a package's entry module to fail fast when two
 * copies of that package end up loaded in one process.
 *
 * @remarks
 * The first call records `moduleUrl` on `globalThis`, under
 * `Symbol.for('rhombus-toolkit:' + packageName + '/instance')`. Every later
 * call compares against that record: the same URL means this same copy is
 * just being evaluated again, and nothing happens; a different URL means a
 * second copy of the package is loading, and the call throws an error naming
 * both URLs.
 */
export function stampSingleInstance(packageName: string, moduleUrl: string): void {
  const slot = Symbol.for(`rhombus-toolkit:${packageName}/instance`);
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

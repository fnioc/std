// The dual-export extension-method infrastructure (docs/decisions.md §22).
//
// Every "extension method" in the workspace is authored ONCE as a receiver-first
// free function and then made available in BOTH forms: the standalone function
// itself (a fallback / testing surface -- importable, tree-shakeable, no
// prototype-mutation side effect) AND a prototype/instance method installed via
// `applyExtensions`. The method form stays the primary path; the standalone form
// exists for availability, not everyday reach.
//
// This infrastructure lives in `primitives` -- the universal zero-dependency
// leaf -- because di and config must stay mutually unaware (di ⊥ config, §4.3):
// `di.core` is disqualified as the home because the config-provider packages
// would then need a config→di edge just to reach the installer. primitives is
// the only package every family can already depend on.
//
// `primitives` is deliberately dependency-free, so the extension-set member type
// is spelled as a bare receiver-first function type here rather than pulling in
// `@rhombus-toolkit/func` (which would fork the leaf's zero-dependency invariant).

/** An object literal of receiver-first extension functions all sharing receiver type R. */
export type ExtensionSet<R> = Record<string, (receiver: R, ...args: any[]) => unknown>;

/**
 * Definition-site validator: constrains members to receiver-first on R (and
 * contextually types the receiver so members can omit the annotation), returns
 * the literal unchanged.
 *
 * A curried identity is used instead of `satisfies ExtensionSet<R>` because
 * assignability lets a 0-argument member slip through a `satisfies` check; the
 * curried form pins R first so each member is contextually receiver-typed. The
 * 0-arg omission is intentionally NOT guarded -- a body that never reaches the
 * thing it extends is a self-evident mistake.
 */
export const defineExtensions = <R>() => <E extends ExtensionSet<R>>(extensions: E): E => extensions;

/**
 * Dumb installer: mounts each extension onto `Ctor.prototype` as a
 * `this`-forwarding method. No validation -- only a library author calls this.
 * The forwarding thunk MUST `return` so fluent chaining survives.
 */
export function applyExtensions<R>(Ctor: { prototype: R }, extensions: ExtensionSet<R>): void {
  Object.assign(
    (Ctor as { prototype: Record<string, unknown> }).prototype,
    Object.fromEntries(
      Object.entries(extensions).map(([name, fn]) => [
        name,
        function(this: R, ...args: any[]) {
          return fn(this, ...args);
        },
      ]),
    ),
  );
}

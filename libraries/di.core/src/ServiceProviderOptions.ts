// The provider-construction options — the reference `ServiceProviderOptions`
// analog. The reference declares this type in its concrete container package
// (beside its `BuildServiceProvider` extensions); here the TYPE is hoisted into
// di.core because `build(options?)` is declared on the `IServiceManifestBase`
// authoring interface (this package), so the parameter type must be reachable
// without the runtime engine. Pure data — the engine (`@rhombus-std/di`) is the
// only reader of the flags.

/**
 * Options configuring the behaviors of the provider `build()` constructs — the
 * reference `ServiceProviderOptions` analog. Both flags default to `false`.
 */
export interface ServiceProviderOptions {
  /**
   * When `true`, the provider validates SCOPE OWNERSHIP at resolution time: a
   * scope-tagged registration that finds no matching open frame — and would
   * therefore silently resolve transiently — throws `ScopeValidationError`
   * instead. This is the engine's analog of the reference validator's
   * "scoped service resolved from the root provider" and "scoped service
   * consumed by a singleton" checks: with scopes as uniform named frames, the
   * one rule "a tag with no open owner frame is a scope violation" covers both.
   */
  validateScopes?: boolean;
  /**
   * When `true`, `build()` eagerly validates EVERY sealed registration —
   * signature satisfiability, dependency reachability (recursively), raw
   * template slots, factory targets, and cycles — and throws a single
   * `AggregateError` collecting every per-registration failure. Open-template
   * registrations are not validated (there are no closed args to substitute),
   * mirroring the reference's "open generic services aren't validated".
   */
  validateOnBuild?: boolean;
}

/**
 * Options configuring the behavior of the provider `build()` constructs. Both
 * flags default to `false`.
 */
export interface ServiceProviderOptions {
  /**
   * When `true`, the provider validates SCOPE OWNERSHIP at resolution time: a
   * scope-tagged registration that finds no matching open frame — and would
   * therefore silently resolve transiently — throws `ScopeValidationError`
   * instead. With scopes as uniform named frames, that one rule covers both
   * "resolved with no scope open" and "captured by a longer-lived owner".
   */
  validateScopes?: boolean;
  /**
   * When `true`, `build()` eagerly validates EVERY sealed registration —
   * signature satisfiability, dependency reachability (recursively), raw
   * template slots, factory targets, and cycles — and throws a single
   * `AggregateError` collecting every per-registration failure. Open-template
   * registrations are skipped: there are no closed args to substitute.
   */
  validateOnBuild?: boolean;
}

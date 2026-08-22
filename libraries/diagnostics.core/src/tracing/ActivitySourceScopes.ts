// The tracing counterpart of MeterScope. Pure data -- no tracing runtime backs it.

/**
 * Lifetime used by {@link TracingRule} to distinguish global activity sources
 * (created via an activity-source constructor) from local ones (created via a
 * DI activity-source factory). A bitflag enum; {@link ACTIVITY_SOURCE_SCOPES_ALL}
 * is both.
 */
export enum ActivitySourceScopes {
  /** No scope. Not a usable value -- a {@link TracingRule} rejects it. */
  None = 0,
  /** Activity sources created via an `ActivitySource` constructor. */
  Global = 1,
  /** Activity sources created via a dependency-injection activity-source factory. */
  Local = 2,
}

/** {@link ActivitySourceScopes.Global} and {@link ActivitySourceScopes.Local} combined. */
export const ACTIVITY_SOURCE_SCOPES_ALL: ActivitySourceScopes = ActivitySourceScopes.Global
  | ActivitySourceScopes.Local;

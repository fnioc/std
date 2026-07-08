// ActivitySourceScopes -- ported from MED.Tracing's `ActivitySourceScopes`
// `[Flags]` enum.
//
// The tracing analog of MeterScope: distinguishes activity sources created
// "globally" (via an ActivitySource constructor) from those created "locally"
// (via a DI activity-source factory). Used by TracingRule. No tracing runtime
// backs it -- pure data.

/**
 * Scopes used by {@link TracingRule} to distinguish global activity sources
 * (created via an activity-source constructor) from local ones (created via a
 * DI activity-source factory). A `[Flags]`-style enum. {@link ACTIVITY_SOURCE_SCOPES_ALL}
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

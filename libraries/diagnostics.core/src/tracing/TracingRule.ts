import { ActivitySourceScopes } from './ActivitySourceScopes';

/**
 * A single tracing enablement rule: determines which activities are enabled for
 * which listeners. An unspecified/empty name field matches anything.
 */
export class TracingRule {
  /** The activity-source name -- exact, longest-prefix, or a single-`*` wildcard. Empty/`undefined` matches all sources. */
  readonly sourceName: string | undefined;
  /** The activity operation name (exact match). Empty/`undefined` matches all activities. */
  readonly operationName: string | undefined;
  /** The listener name (exact match). Empty/`undefined` matches all listeners. */
  readonly listenerName: string | undefined;
  /** The scope(s) this rule applies to. Never {@link ActivitySourceScopes.None}. */
  readonly scopes: ActivitySourceScopes;
  /** Whether matched activities are enabled (`true`) or disabled (`false`). */
  readonly enable: boolean;

  /**
   * @param sourceName The source name, prefix, or single-`*` pattern; empty/`undefined` matches all.
   * @param operationName The operation name; empty/`undefined` matches all activities.
   * @param listenerName The listener name; empty/`undefined` matches all listeners.
   * @param scopes The scope(s) to consider. Throws {@link RangeError} if {@link ActivitySourceScopes.None}.
   * @param enable `true` to enable matched activities for the listener; otherwise `false`.
   * @throws {@link Error} if `sourceName` contains more than one `*` wildcard.
   */
  public constructor(sourceName: string | undefined, operationName: string | undefined,
    listenerName: string | undefined, scopes: ActivitySourceScopes, enable: boolean) {
    // Validated here (not lazily at match time) so a malformed pattern
    // surfaces at construction.
    if (sourceName) {
      const firstWildcard = sourceName.indexOf('*');
      if (firstWildcard >= 0 && sourceName.indexOf('*', firstWildcard + 1) >= 0) {
        throw new Error("Only one '*' wildcard is allowed in an activity source name pattern.");
      }
    }
    if (scopes === ActivitySourceScopes.None) {
      throw new RangeError('The ActivitySourceScopes must be Global, Local, or both.');
    }
    this.sourceName = sourceName;
    this.operationName = operationName;
    this.listenerName = listenerName;
    this.scopes = scopes;
    this.enable = enable;
  }
}

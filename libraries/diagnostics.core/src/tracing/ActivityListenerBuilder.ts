import type { Func } from '@rhombus-toolkit/types';

/**
 * The user-configurable surface of a tracing listener: a name plus optional
 * sample/lifecycle delegates, configured via the callback passed to
 * {@link addTracingListener}. The delegate parameter types collapse to
 * `unknown` -- this repo has no Activity/ActivitySource runtime to type them
 * against.
 */
export class ActivityListenerBuilder {
  /** The name configuration-based filtering targets rules at this listener by. */
  readonly name: string;

  /** Invoked when an activity is sampled from an activity context. */
  sample?: Func<[unknown], unknown>;
  /** Invoked when an activity is sampled from a parent-id string. */
  sampleUsingParentId?: Func<[unknown], unknown>;
  /** Invoked when a sampled activity starts. */
  activityStarted?: Func<[unknown], void>;
  /** Invoked when a sampled activity stops. */
  activityStopped?: Func<[unknown], void>;
  /** Invoked when an error is recorded on a sampled activity. */
  errorRecorder?: Func<[unknown, unknown, unknown], void>;

  /** @param name The listener name used for rule matching. */
  public constructor(name: string) {
    this.name = name;
  }
}

// ActivityListenerBuilder -- ported from MED.Tracing's `ActivityListenerBuilder`,
// REDUCED for the absence of a tracing runtime.
//
// The reference type is the user-configurable surface of an ActivityListener:
// a name plus delegate properties (Sample / SampleUsingParentId / ActivityStarted
// / ActivityStopped / ExceptionRecorder). Those delegates are typed in terms of
// the reference runtime's Activity / ActivityContext / SampleActivity<T> /
// ExceptionRecorder types (System.Diagnostics), which this repo has no analog
// for. The shape is preserved (so `addTracingListener(name, configure)` gives a
// real, configurable object) but the delegate parameter/return types collapse to
// `unknown` -- there is nothing here that constructs a real listener from it.
// See the package tbd notes.

import type { Func } from '@rhombus-toolkit/func';

/**
 * The user-configurable surface of a tracing listener. Mirrors MED.Tracing's
 * `ActivityListenerBuilder`, with the activity-typed delegate parameters reduced
 * to `unknown` (no Activity/ActivitySource runtime in this repo). Configured via
 * the callback passed to {@link addTracingListener}.
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

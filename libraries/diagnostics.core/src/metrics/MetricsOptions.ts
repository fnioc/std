// MetricsOptions -- ported from MED.Metrics's `MetricsOptions`.
//
// The bound options object the metrics system configures itself from: an
// ordered list of InstrumentRules. Both the builder rule-configuration
// extension methods and the config-binding step (in @rhombus-std/diagnostics)
// append rules here.

import type { InstrumentRule } from "./InstrumentRule";

/**
 * Options for configuring the metrics system: the set of {@link InstrumentRule}s
 * that identify which metrics, instruments, and listeners are enabled. Mirrors
 * MED.Metrics's `MetricsOptions`.
 */
export class MetricsOptions {
  /** The instrument rules, in registration order. */
  readonly rules: InstrumentRule[] = [];
}

import type { InstrumentRule } from './InstrumentRule';

/**
 * Options for configuring the metrics system: the ordered set of
 * {@link InstrumentRule}s that identify which metrics, instruments, and
 * listeners are enabled.
 *
 * @remarks
 * Rules can arrive from two places: the builder rule-configuration augmentation
 * methods, and the config-binding step in `@rhombus-std/diagnostics`.
 */
export class MetricsOptions {
  /** The instrument rules, in registration order. */
  readonly rules: InstrumentRule[] = [];
}

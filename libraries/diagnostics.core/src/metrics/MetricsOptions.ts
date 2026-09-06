import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
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
@augment(typefor<MetricsOptions>())
export class MetricsOptions {
  /** The instrument rules, in registration order. */
  readonly rules: InstrumentRule[] = [];
}

import type { TracingRule } from './TracingRule';

/**
 * Options for configuring the tracing system: the set of {@link TracingRule}s
 * that identify which activity sources, activities, and listeners are enabled.
 */
export class TracingOptions {
  /** The tracing rules, in registration order. */
  readonly rules: TracingRule[] = [];
}

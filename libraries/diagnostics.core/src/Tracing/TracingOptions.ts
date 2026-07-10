// TracingOptions -- ported from MED.Tracing's `TracingOptions`.

import type { TracingRule } from "./TracingRule";

/**
 * Options for configuring the tracing system: the set of {@link TracingRule}s
 * that identify which activity sources, activities, and listeners are enabled.
 * Mirrors MED.Tracing's `TracingOptions`.
 */
export class TracingOptions {
  /** The tracing rules, in registration order. */
  readonly rules: TracingRule[] = [];
}

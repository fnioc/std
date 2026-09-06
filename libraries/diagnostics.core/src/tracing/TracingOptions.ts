import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { TracingRule } from './TracingRule';

/**
 * Options for configuring the tracing system: the set of {@link TracingRule}s
 * that identify which activity sources, activities, and listeners are enabled.
 */
@augment(typefor<TracingOptions>())
export class TracingOptions {
  /** The tracing rules, in registration order. */
  readonly rules: TracingRule[] = [];
}

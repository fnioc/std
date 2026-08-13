// The TracingOptions-targeted rule mutators: the value-object counterparts of
// the same-named ITracingBuilder methods, distinguished only by receiver.

import { applyAugmentations, type AugmentationSet } from '@rhombus-std/primitives';

import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from './ActivitySourceScopes';
import { TracingOptions } from './TracingOptions';
import { TracingRule } from './TracingRule';

interface ITracingOptionsAugmentations {
  enableTracing(sourceName?: string, operationName?: string, listenerName?: string,
    scopes?: ActivitySourceScopes): this;
  disableTracing(sourceName?: string, operationName?: string, listenerName?: string,
    scopes?: ActivitySourceScopes): this;
}

declare module '@rhombus-std/diagnostics.core' {
  interface TracingOptions extends ITracingOptionsAugmentations {}
}

export const TracingOptionsAugmentations = {
  /** Appends an ENABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  enableTracing(sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): TracingOptions {
    this.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, true));
    return this;
  },
  /** Appends a DISABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  disableTracing(sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): TracingOptions {
    this.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, false));
    return this;
  },
} satisfies AugmentationSet<TracingOptions>;

applyAugmentations(TracingOptions, TracingOptionsAugmentations);

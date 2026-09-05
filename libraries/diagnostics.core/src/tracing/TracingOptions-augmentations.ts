// The TracingOptions-targeted rule mutators: the value-object counterparts of
// the same-named ITracingBuilder methods, distinguished only by receiver.

import { applyAugmentations } from '@rhombus-std/primitives';
import type { Flatten } from '@rhombus-toolkit/types';

import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from './ActivitySourceScopes';
import { TracingOptions } from './TracingOptions';
import { TracingRule } from './TracingRule';

export namespace TracingOptionsAugmentations {
  /** Appends an ENABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  export function enableTracing<Self extends TracingOptions>(this: Self, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): Self {
    this.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, true));
    return this;
  }

  /** Appends a DISABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  export function disableTracing<Self extends TracingOptions>(this: Self, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): Self {
    this.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, false));
    return this;
  }
}

declare module '@rhombus-std/diagnostics.core' {
  interface TracingOptions extends Flatten<typeof TracingOptionsAugmentations> {}
}

applyAugmentations(TracingOptions, TracingOptionsAugmentations);

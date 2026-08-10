// The TracingOptions-targeted rule mutators: the value-object counterparts of
// the same-named ITracingBuilder methods, distinguished only by receiver. A
// CLOSED set -- TracingOptions is this package's own concrete class -- so the
// install is a direct applyAugmentations, in ../options-install.

import type { AugmentationSet } from '@rhombus-std/primitives';

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
  enableTracing(options: TracingOptions, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): TracingOptions {
    options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, true));
    return options;
  },
  /** Appends a DISABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  disableTracing(options: TracingOptions, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): TracingOptions {
    options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, false));
    return options;
  },
} satisfies AugmentationSet<TracingOptions>;

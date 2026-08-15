// The MetricsOptions-targeted rule mutators: the value-object counterparts of
// the same-named IMetricsBuilder methods, distinguished only by receiver.
//
// `undefined` name arguments match anything.

import { applyAugmentations } from '@rhombus-std/primitives';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

import { InstrumentRule } from './InstrumentRule';
import { METER_SCOPE_ALL, MeterScope } from './MeterScope';
import { MetricsOptions } from './MetricsOptions';

export namespace MetricsOptionsAugmentations {
  /** Appends an ENABLE {@link InstrumentRule} directly to a {@link MetricsOptions}. */
  export function enableMetrics<Self extends MetricsOptions>(this: Self, meterName?: string, instrumentName?: string,
    listenerName?: string, scopes: MeterScope = METER_SCOPE_ALL): Self {
    this.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, true));
    return this;
  }

  /** Appends a DISABLE {@link InstrumentRule} directly to a {@link MetricsOptions}. */
  export function disableMetrics<Self extends MetricsOptions>(this: Self, meterName?: string, instrumentName?: string,
    listenerName?: string, scopes: MeterScope = METER_SCOPE_ALL): Self {
    this.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, false));
    return this;
  }
}

declare module '@rhombus-std/diagnostics.core' {
  interface MetricsOptions extends Flatten<typeof MetricsOptionsAugmentations> {}
}

applyAugmentations(MetricsOptions, MetricsOptionsAugmentations);

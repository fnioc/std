// The MetricsOptions-targeted rule mutators: the value-object counterparts of
// the same-named IMetricsBuilder methods, distinguished only by receiver.
//
// `undefined` name arguments match anything.

import type { AugmentationSet } from '@rhombus-std/primitives';

import { InstrumentRule } from './InstrumentRule';
import { METER_SCOPE_ALL, MeterScope } from './MeterScope';
import { MetricsOptions } from './MetricsOptions';

interface IMetricsOptionsAugmentations {
  enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
  disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
}

declare module '@rhombus-std/diagnostics.core' {
  interface MetricsOptions extends IMetricsOptionsAugmentations {}
}

export const MetricsOptionsAugmentations = {
  /** Appends an ENABLE {@link InstrumentRule} directly to a {@link MetricsOptions}. */
  enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL): MetricsOptions {
    this.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, true));
    return this;
  },
  /** Appends a DISABLE {@link InstrumentRule} directly to a {@link MetricsOptions}. */
  disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL): MetricsOptions {
    this.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, false));
    return this;
  },
} satisfies AugmentationSet<MetricsOptions>;

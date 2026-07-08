// IMetricsListener / IObservableInstrumentsSource -- ported from
// MED.Metrics.Abstractions, REDUCED to what is meaningful without a metrics
// runtime.
//
// The reference `IMetricsListener` also declares Initialize/InstrumentPublished/
// MeasurementsCompleted/GetMeasurementHandlers -- all expressed in terms of the
// reference runtime's Instrument / MeasurementCallback<T> / MeasurementHandlers
// types (System.Diagnostics.Metrics). This repo has no Meter/Instrument/
// measurement-callback runtime, so those members are intentionally NOT ported
// (see the package tbd notes). What survives is `name` -- the identity the
// rule-matching system (InstrumentRule.listenerName) keys on -- which is
// genuinely useful on its own.

/**
 * Requests that the current set of measurements for enabled observable
 * instruments be delivered to the listener. Mirrors MED.Metrics's
 * `IObservableInstrumentsSource`. Provided for contract completeness; there is
 * no instrument runtime driving it in this repo.
 */
export interface IObservableInstrumentsSource {
  /** Requests the current measurements for enabled observable instruments. */
  recordObservableInstruments(): void;
}

/**
 * A metrics listener's identity, as seen by the rule-matching system. Mirrors
 * MED.Metrics's `IMetricsListener`, reduced to `name`: the measurement-callback
 * surface (Initialize/InstrumentPublished/MeasurementsCompleted/
 * GetMeasurementHandlers) is not ported because it requires an instrument /
 * measurement runtime this repo does not have.
 */
export interface IMetricsListener {
  /** The listener name, used by {@link InstrumentRule.listenerName} rule matching. */
  readonly name: string;
}

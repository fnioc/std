/**
 * Requests that the current set of measurements for enabled observable
 * instruments be delivered to the listener. Provided for contract
 * completeness; there is no instrument runtime driving it in this repo.
 */
export interface IObservableInstrumentsSource {
  /** Requests the current measurements for enabled observable instruments. */
  recordObservableInstruments(): void;
}

/**
 * A metrics listener's identity, as seen by the rule-matching system --
 * reduced to `name`, since this package has no instrument/measurement runtime
 * to drive a fuller listener contract.
 */
export interface IMetricsListener {
  /** The listener name, used by {@link InstrumentRule.listenerName} rule matching. */
  readonly name: string;
}

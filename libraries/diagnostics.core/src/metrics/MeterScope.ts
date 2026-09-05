/**
 * Lifetime used by {@link InstrumentRule} to distinguish global meters (created
 * via a meter constructor) from local meters (created via a DI meter factory).
 * A bitwise-flag enum: {@link MeterScope.Global} and {@link MeterScope.Local}
 * combine, and {@link METER_SCOPE_ALL} is both.
 */
export enum MeterScope {
  /** No scope. Not a usable value -- an {@link InstrumentRule} rejects it. */
  None = 0,
  /** Meters created via a `Meter` constructor. */
  Global = 1,
  /** Meters created via a dependency-injection meter factory. */
  Local = 2,
}

/** {@link MeterScope.Global} and {@link MeterScope.Local} combined -- every scope. */
export const METER_SCOPE_ALL: MeterScope = MeterScope.Global | MeterScope.Local;

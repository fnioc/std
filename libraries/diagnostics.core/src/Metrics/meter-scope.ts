// MeterScope -- ported from MED.Metrics's `MeterScope` `[Flags]` enum.
//
// Distinguishes meters created "globally" (via a Meter constructor) from those
// created "locally" (via a DI meter factory). Used by InstrumentRule to scope a
// rule to one or both. There is no meter/instrument RUNTIME in this repo, so the
// enum carries no behavior on its own -- it is the pure data an InstrumentRule
// and the rule-configuration surface are expressed in terms of.

/**
 * Scopes used by {@link InstrumentRule} to distinguish global meters (created
 * via a meter constructor) from local meters (created via a DI meter factory).
 * A `[Flags]`-style enum: {@link MeterScope.Global} and {@link MeterScope.Local}
 * combine bitwise, and {@link METER_SCOPE_ALL} is both.
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

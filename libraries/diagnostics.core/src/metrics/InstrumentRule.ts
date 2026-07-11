// InstrumentRule -- ported from MED.Metrics's `InstrumentRule`.
//
// A pure-data record: which meter / instrument / listener a rule targets, the
// scope(s) it applies to, and whether it enables or disables. Unspecified
// (`undefined`) name fields match anything. This ports cleanly with no
// metrics runtime behind it -- it is only strings + a scope enum + a boolean.

import { MeterScope } from "./meter-scope";

/**
 * A single metrics enablement rule: determines which instruments are enabled
 * for which listeners. An unspecified name field (`undefined`) matches
 * anything. Mirrors MED.Metrics's `InstrumentRule`.
 */
export class InstrumentRule {
  /** The meter name (exact or longest-prefix match). `undefined` matches all meters. */
  readonly meterName: string | undefined;
  /** The instrument name (exact match). `undefined` matches all instruments. */
  readonly instrumentName: string | undefined;
  /** The listener name (exact match). `undefined` matches all listeners. */
  readonly listenerName: string | undefined;
  /** The meter scope(s) this rule applies to. Never {@link MeterScope.None}. */
  readonly scopes: MeterScope;
  /** Whether a matched instrument is enabled (`true`) or disabled (`false`). */
  readonly enable: boolean;

  /**
   * @param meterName The meter name or prefix; `undefined` matches all meters.
   * @param instrumentName The instrument name; `undefined` matches all instruments.
   * @param listenerName The listener name; `undefined` matches all listeners.
   * @param scopes The scope(s) to consider. Throws {@link RangeError} if {@link MeterScope.None}.
   * @param enable `true` to enable the matched instrument for the listener; otherwise `false`.
   */
  public constructor(
    meterName: string | undefined,
    instrumentName: string | undefined,
    listenerName: string | undefined,
    scopes: MeterScope,
    enable: boolean,
  ) {
    if (scopes === MeterScope.None) {
      throw new RangeError("The MeterScope must be Global, Local, or both.");
    }
    this.meterName = meterName;
    this.instrumentName = instrumentName;
    this.listenerName = listenerName;
    this.scopes = scopes;
    this.enable = enable;
  }
}

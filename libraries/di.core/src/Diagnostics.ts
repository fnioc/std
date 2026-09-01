import { type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/** What a probe was standing in when it read the clock: its own place in the request chain, or one of the four hooks. */
export type DiagnosticPhase = 'resolve' | 'beginResolve' | 'beforeConstruct' | 'canonicalize' | 'afterConstruct';

/** Which side of the call a reading was taken on. */
export type DiagnosticEdge = 'pre' | 'post';

/** One clock reading, taken either side of a call a probe stands around. */
export interface DiagnosticReading {
  /** What the probe was standing in. */
  readonly phase: DiagnosticPhase;
  /** Whether the reading was taken going in or coming back out. */
  readonly edge: DiagnosticEdge;
  /** The ask for `resolve` and `beginResolve`, the construction's populated address otherwise. */
  readonly address: Type;
  /**
   * The construction this reading belongs to, absent for the probe's own `resolve` pair and for
   * `beginResolve`.
   *
   * @remarks
   * Referentially stable and opaque: it is what pairs a `pre` with its `post` and nests one
   * construction inside another, since one graph can reach the same address more than once and the
   * address alone cannot tell those apart.
   */
  readonly node?: object;
  /** What the clock read. */
  readonly at: number;
}

/** One probe's readings, named for the probe that recorded them. */
export interface DiagnosticsSegment {
  /** The name the recording probe was configured with. */
  readonly name: string;
  /** Every reading that probe has taken so far, oldest first. */
  readonly readings: readonly DiagnosticReading[];
}

/** Access to what every installed diagnostics addon has recorded, one segment per probe. */
export interface Diagnostics {
  /** One segment per installed probe, in no meaningful order relative to each other. */
  get segments(): readonly DiagnosticsSegment[];
}

export namespace Diagnostics {
  /** The address a diagnostics addon answers when named as a constructor dependency. */
  export const address: Type = typefor<Diagnostics>();
}

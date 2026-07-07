// EventId — identifies a logging event, ported from ME.Logging.Abstractions'
// `EventId` readonly struct. The primary identifier is `id`; `name` is an
// optional short description.
//
// The reference type is a value struct with an implicit `int -> EventId`
// conversion, so every logging API that takes an EventId also accepts a bare
// integer. TS has no implicit conversions, so callers pass a number and the
// APIs coerce via {@link EventId.from} (see `toEventId`). Equality is by `id`
// only, mirroring the reference struct's `Equals`/`GetHashCode`.

export class EventId {
  /** The numeric identifier for this event. */
  public readonly id: number;

  /** The name of this event, or `undefined`. */
  public readonly name: string | undefined;

  public constructor(id: number, name?: string) {
    this.id = id;
    this.name = name;
  }

  /**
   * Coerces a bare integer into an `EventId` — the TS stand-in for the
   * reference struct's implicit `int -> EventId` conversion. Passing an
   * existing `EventId` returns it unchanged.
   */
  public static from(value: EventId | number): EventId {
    return typeof value === "number" ? new EventId(value) : value;
  }

  /** Two events are equal when they share the same `id`. */
  public equals(other: EventId): boolean {
    return this.id === other.id;
  }

  public toString(): string {
    return this.name ?? String(this.id);
  }
}

/** The value the logging sugar accepts wherever the reference API takes an `EventId`. */
export type EventIdLike = EventId | number;

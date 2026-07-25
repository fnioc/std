// EventId identifies a logging event: the numeric `id` plus an optional short
// `name`. Wherever an API takes an `EventId` it also accepts a bare number,
// coerced via {@link EventId.from}.

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
   * Coerces a bare integer into an `EventId`; an existing `EventId` is returned
   * unchanged.
   */
  public static from(value: EventId | number): EventId {
    return typeof value === 'number' ? new EventId(value) : value;
  }

  /** Two events are equal when they share the same `id`. */
  public equals(other: EventId): boolean {
    return this.id === other.id;
  }

  public toString(): string {
    return this.name ?? String(this.id);
  }
}

/** An `EventId`, or the bare integer id that {@link EventId.from} coerces into one. */
export type EventIdLike = EventId | number;

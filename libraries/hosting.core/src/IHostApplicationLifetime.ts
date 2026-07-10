import type { AbortSignal } from "@rhombus-std/primitives";

/** Signals for the host's startup/shutdown lifecycle, and a way to request a stop. */
export interface IHostApplicationLifetime {
  readonly applicationStarted: AbortSignal;
  readonly applicationStopping: AbortSignal;
  readonly applicationStopped: AbortSignal;
  stopApplication(): void;
}

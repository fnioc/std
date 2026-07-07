import type { IHealthCheck } from "@rhombus-std/examples.contracts";

/**
 * The optional health probe only THIS library registers. An app probes for it
 * with `isService` / `tryResolve` — present when this library was wired in.
 */
export class HealthCheck implements IHealthCheck {
  public check(): string {
    return "ok";
  }
}

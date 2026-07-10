// HostOptions -- ported from the reference hosting runtime's `HostOptions`.
//
// Timeouts are milliseconds (the JS timer unit) rather than the reference's
// `TimeSpan`; `Infinity` stands in for the reference `Timeout.InfiniteTimeSpan`
// (no timeout). `initialize` reads the same configuration keys the reference
// reads, folding them onto the defaults.

import type { IConfiguration } from "@rhombus-std/config.core";
import type { BackgroundService, IHost, IHostedLifecycleService } from "@rhombus-std/hosting.core";
import { BackgroundServiceExceptionBehavior } from "./BackgroundServiceExceptionBehavior";

/** Parses a strictly non-negative integer (digits only), or `undefined`. */
function parseNonNegativeInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

/** Parses a `true`/`false` (case-insensitive) flag, or `undefined` when unrecognized. */
function parseBool(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
}

/** Options for an {@link IHost}. */
export class HostOptions {
  /**
   * The default timeout (milliseconds) for {@link IHost.stop}. Also encompasses
   * every {@link IHostedLifecycleService.stopping} / {@link IHostedLifecycleService.stopped}
   * hook. Defaults to 30 seconds.
   */
  public shutdownTimeout = 30_000;

  /**
   * The default timeout (milliseconds) for {@link IHost.start}. Also encompasses
   * every {@link IHostedLifecycleService.starting} / {@link IHostedLifecycleService.started}
   * hook. Defaults to `Infinity` (no timeout).
   */
  public startupTimeout = Number.POSITIVE_INFINITY;

  /**
   * Whether the {@link IHost} starts registered hosted services concurrently
   * (`true`) or sequentially (`false`, the default).
   */
  public servicesStartConcurrently = false;

  /**
   * Whether the {@link IHost} stops registered hosted services concurrently
   * (`true`) or sequentially (`false`, the default).
   */
  public servicesStopConcurrently = false;

  /**
   * The behavior the {@link IHost} follows when a {@link BackgroundService}
   * throws an unhandled exception. Defaults to
   * {@link BackgroundServiceExceptionBehavior.StopHost}.
   */
  public backgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.StopHost;

  /** Folds the host-option configuration keys onto these options. */
  public initialize(configuration: IConfiguration): void {
    const shutdownSeconds = parseNonNegativeInt(configuration.get("shutdownTimeoutSeconds"));
    if (shutdownSeconds !== undefined) {
      this.shutdownTimeout = shutdownSeconds * 1000;
    }

    const startupSeconds = parseNonNegativeInt(configuration.get("startupTimeoutSeconds"));
    if (startupSeconds !== undefined) {
      this.startupTimeout = startupSeconds * 1000;
    }

    const startConcurrently = parseBool(configuration.get("servicesStartConcurrently"));
    if (startConcurrently !== undefined) {
      this.servicesStartConcurrently = startConcurrently;
    }

    const stopConcurrently = parseBool(configuration.get("servicesStopConcurrently"));
    if (stopConcurrently !== undefined) {
      this.servicesStopConcurrently = stopConcurrently;
    }
  }
}

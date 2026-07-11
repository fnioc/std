// BackgroundServiceErrorBehavior -- ported from the reference hosting
// runtime's BackgroundServiceExceptionBehavior enum. Selects what the host does
// when one of its `BackgroundService` instances throws an unhandled error.

import type { BackgroundService, IHost } from '@rhombus-std/hosting.core';

/**
 * Specifies the behavior an {@link IHost} honors when an unhandled error
 * occurs in one of its {@link BackgroundService} instances.
 */
export enum BackgroundServiceErrorBehavior {
  /**
   * Stops the {@link IHost}. If a {@link BackgroundService} throws, the host
   * stops and the process continues.
   */
  StopHost = 0,

  /**
   * Ignores errors thrown in a {@link BackgroundService}. The host logs the
   * error but otherwise ignores it; the service is not restarted.
   */
  Ignore = 1,
}

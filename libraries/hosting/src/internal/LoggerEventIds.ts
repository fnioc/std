// The stable event ids the host runtime emits under -- port of the reference
// hosting runtime's internal `LoggerEventIds` static class.

import { EventId } from '@rhombus-std/logging.core';

/** The stable event ids the host runtime emits under. Mirrors the reference `LoggerEventIds`. */
export const LoggerEventIds = {
  starting: new EventId(1, 'Starting'),
  started: new EventId(2, 'Started'),
  stopping: new EventId(3, 'Stopping'),
  stopped: new EventId(4, 'Stopped'),
  stoppedWithError: new EventId(5, 'StoppedWithError'),
  applicationStartupError: new EventId(6, 'ApplicationStartupError'),
  applicationStoppingError: new EventId(7, 'ApplicationStoppingError'),
  applicationStoppedError: new EventId(8, 'ApplicationStoppedError'),
  backgroundServiceFaulted: new EventId(9, 'BackgroundServiceFaulted'),
  backgroundServiceStoppingHost: new EventId(10, 'BackgroundServiceStoppingHost'),
  hostedServiceStartupFaulted: new EventId(11, 'HostedServiceStartupFaulted'),
} as const;

// The stable event ids the host runtime emits under -- port of the reference
// hosting runtime's internal `LoggerEventIds` static class.

import { EventId } from "@rhombus-std/logging.core";

/** The stable event ids the host runtime emits under. Mirrors the reference `LoggerEventIds`. */
export const LoggerEventIds = {
  starting: new EventId(1, "Starting"),
  started: new EventId(2, "Started"),
  stopping: new EventId(3, "Stopping"),
  stopped: new EventId(4, "Stopped"),
  stoppedWithException: new EventId(5, "StoppedWithException"),
  applicationStartupException: new EventId(6, "ApplicationStartupException"),
  applicationStoppingException: new EventId(7, "ApplicationStoppingException"),
  applicationStoppedException: new EventId(8, "ApplicationStoppedException"),
  backgroundServiceFaulted: new EventId(9, "BackgroundServiceFaulted"),
  backgroundServiceStoppingHost: new EventId(10, "BackgroundServiceStoppingHost"),
  hostedServiceStartupFaulted: new EventId(11, "HostedServiceStartupFaulted"),
} as const;

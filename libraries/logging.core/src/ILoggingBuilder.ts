// ILoggingBuilder, ported from ME.Logging.Abstractions' `ILoggingBuilder`.
//
// The reference interface exposes `IServiceCollection Services { get; }`. This
// repo's `IServiceCollection` analog is @rhombus-std/di.core's registration
// builder `ServiceManifest`, so `services` is typed against it. logging.core
// depends on di.core for this type alone (mirrors the reference edge
// `Logging.Abstractions -> DependencyInjection.Abstractions`).

import type { ServiceManifest } from '@rhombus-std/di.core';

/** An interface for configuring logging providers. */
export interface ILoggingBuilder {
  /** The registration builder where logging services are configured. */
  readonly services: ServiceManifest;
}

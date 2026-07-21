// ILoggingBuilder, ported from ME.Logging.Abstractions' `ILoggingBuilder`.
//
// The reference interface exposes `IServiceCollection Services { get; }`. This
// repo's `IServiceCollection` analog is @rhombus-std/di.core's registration
// builder `IServiceManifest`, so `services` is typed against it. logging.core
// depends on di.core for this type alone (mirrors the reference edge
// `Logging.Abstractions -> DependencyInjection.Abstractions`).

import type { IServiceManifestHolder } from '@rhombus-std/di.core';

/**
 * An interface for configuring logging providers.
 *
 * It is an {@link IServiceManifestHolder}: `services` is WRITABLE, because the
 * manifest chain is immutable. An augmentation that registers something
 * reassigns `builder.services = builder.services.addX(...)` and hands the SAME
 * builder back, so a `configure` delegate keeps the mutation-shaped ergonomics
 * a no-transformer author expects over an immutable chain underneath.
 */
export interface ILoggingBuilder extends IServiceManifestHolder {}

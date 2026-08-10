import type { IServiceManifestHolder } from '@rhombus-std/di2.core';

/**
 * An interface for configuring logging providers.
 *
 * It is an {@link IServiceManifestHolder}: `services` is WRITABLE, because the
 * manifest chain is immutable. An augmentation that registers something
 * reassigns `builder.services = builder.services.addX(...)` and hands the
 * SAME builder back, so a `configure` delegate can keep mutating `services`
 * in place even though each step actually returns a new manifest.
 */
export interface ILoggingBuilder extends IServiceManifestHolder {}

import type { Manifest } from '@rhombus-std/di.core';

/**
 * An interface for configuring logging providers.
 *
 * `services` is WRITABLE, because the manifest chain is immutable. An
 * augmentation that registers something
 * reassigns `builder.services = builder.services.addX(...)` and hands the
 * SAME builder back, so a `configure` delegate can keep mutating `services`
 * in place even though each step actually returns a new manifest.
 */
export interface ILoggingBuilder {
  /** The current manifest. Reassigned by every registration made through the builder. */
  services: Manifest<any>;
}

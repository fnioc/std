/**
 * Placeholder for the DI-resolved service container. `IHost.services` will
 * become the real `ServiceProvider` from `@rhombus-std/di` once hosting is
 * wired to DI in a later increment -- `@rhombus-std/di` isn't a dependency
 * of this package yet, so this is a minimal stand-in with the same shape.
 */
export interface ServiceProvider {
  getService<T>(serviceType: unknown): T | undefined;
}

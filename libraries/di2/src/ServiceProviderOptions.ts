/** How a {@link ServiceProvider} behaves, chosen when it is built. */
export interface ServiceProviderOptions {
  /**
   * Lower every registration while the provider is being built rather than on first request, so
   * a graph that cannot be satisfied fails at the build instead of at some later resolution.
   * Every failure is collected and raised together as one `ManifestValidationError`.
   *
   * Open registrations are skipped: with no request to close their placeholders against, there
   * is nothing to lower yet.
   */
  readonly validateOnBuild?: boolean;
}

export namespace ServiceProviderOptions {
  /** What a provider built without options gets. */
  export const defaults: ServiceProviderOptions = { validateOnBuild: false };
}

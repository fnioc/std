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

  /**
   * What to do when a union dependency has more than one member the manifest can supply.
   *
   * `'error'` raises an `AmbiguousUnionError` naming the competing members, on the reading that a
   * union states which types will do rather than which to prefer, so two answers means the
   * registrations have not said enough. `'newest'` takes the member whose registration is most
   * recent, matching how the manifest already settles two registrations of one type.
   *
   * Neither setting affects a union with a single suppliable member, nor one that falls back to a
   * self-supplying member such as `undefined`.
   */
  readonly unionAmbiguity?: 'error' | 'newest';
}

export namespace ServiceProviderOptions {
  /** What a provider built without options gets. */
  export const defaults: ServiceProviderOptions = { validateOnBuild: false, unionAmbiguity: 'error' };
}

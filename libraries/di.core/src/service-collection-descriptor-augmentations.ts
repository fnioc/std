// The `ServiceCollectionDescriptorExtensions` augmentation -- descriptor-level
// mutation verbs on the registration builder (docs/decisions.md §28/§38). Mirrors
// the reference DI static class `ServiceCollectionDescriptorExtensions`
// (DependencyInjection.Abstractions/src/Extensions), an OPEN augmentation on the
// registration-collection receiver.
//
// This is an OPEN set (the `ServiceManifest` receiver is extended by many
// downstream families), so it registers against `SERVICE_MANIFEST_AUGMENTATION_TOKEN`
// through the primitives augmentation registry rather than a direct
// `applyAugmentations` at the class -- the same token every cross-package
// registration augmentation (`addOptions`, `addLogging`, `addMetrics`, ...)
// targets. `ServiceManifestClass` is decorated with `@augment(token)` in
// `service-manifest.ts`, so registering here reaches its prototype.
//
// Ported members:
//   - `removeAll(token)` -- removes EVERY registration bound to `token` (the
//     reference `RemoveAll(Type)` / `RemoveAll<T>()`; a token is our service-type
//     analog). Required by logging's `clearProviders`, which strips all
//     `ILoggerProvider` registrations. Returns the collection for chaining.
//
// DEFERRED -- `tryAddEnumerable`: the reference verb dedupes by
// (serviceType, implementationType), but our normalized `Registration` collapses a
// class into an opaque `produce` closure and keeps only a diagnostic `name`, so the
// implementation-type identity the dedup needs is not recoverable post-registration.
// Modeling it faithfully means carrying an implementation-identity field on
// `Registration` and threading it through the `add` path -- a deeper change than
// this conversion should smuggle in, and it has no in-tree consumer yet. Filed for
// the finalize phase (tracked against #75).

import { registerAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";

import { SERVICE_MANIFEST_AUGMENTATION_TOKEN } from "./augmentation-tokens.js";
// Type-only: the const references `ServiceManifestClass` solely in type position
// (the `satisfies` bound and the receiver annotation); the runtime install goes
// through the registry, not a direct `applyAugmentations(ServiceManifestClass, …)`.
import type { ServiceManifestClass } from "./service-manifest.js";
import type { Token } from "./types.js";

// The authored verb merges onto core's `ServiceManifestBase` interface -- the
// surface the public `ServiceManifest` a consumer holds resolves to -- AND onto
// the concrete `ServiceManifestClass`, so the class still SATISFIES
// `implements ServiceManifestBase` once the new name is on the interface. `Token`
// is a named import because unqualified names in a `declare module` body resolve
// in THIS file's scope. `Provider` is defaulted so each merge matches its target's
// type-parameter list (TS2428 requires identical parameters).
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    /**
     * Removes every registration bound to `token` (exact and open). The
     * reference `RemoveAll(Type)` / `RemoveAll<T>()` analog -- a `Token` is our
     * service-type key. Returns the collection so removals chain.
     */
    removeAll(token: Token): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    removeAll(token: Token): this;
  }
}

// One named object literal mirroring one reference static class (docs §28):
// `ServiceCollectionDescriptorExtensions`. The exported const IS the standalone
// call surface; registering it installs the fluent prototype method. Receiver-first
// members, checked with `satisfies AugmentationSet<R>`.
export const ServiceCollectionDescriptorExtensions = {
  removeAll(
    manifest: ServiceManifestClass<string>,
    token: Token,
  ): ServiceManifestClass<string> {
    manifest.removeRegistrations(token);
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(SERVICE_MANIFEST_AUGMENTATION_TOKEN, ServiceCollectionDescriptorExtensions);

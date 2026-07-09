// The DI-slot token ABI the hosting family shares. The registration side
// (`addHostedService`, and the host's lifetime registration in
// `@rhombus-std/hosting`) and the resolution side (the internal host resolving
// its hosted services and its lifetime) travel through the container via these
// tokens, so they live here in the abstractions substrate that both depend on.

import type { Token } from "@rhombus-std/di.core";

/**
 * The shared token every hosted service registers under (repeated `add` calls,
 * #48 collection resolution). The host resolves the whole set in registration
 * order via {@link hostedServiceCollectionToken}.
 */
export const HOSTED_SERVICE_TOKEN: Token = "@rhombus-std/hosting.core/IHostedService";

/** The token the host's {@link IHostApplicationLifetime} is registered under. */
export const HOST_APPLICATION_LIFETIME_TOKEN: Token = "@rhombus-std/hosting.core/IHostApplicationLifetime";

/**
 * The collection wrapper token the engine recognizes to aggregate every
 * {@link HOSTED_SERVICE_TOKEN} registration into an array (empty if none).
 */
export function hostedServiceCollectionToken(): Token {
  return `Array<${HOSTED_SERVICE_TOKEN}>`;
}

// The augmentation-registry tokens for hosting.core's OPEN augmentation-target
// receivers (docs/decisions.md §38). Distinct from the DI-slot tokens above: these
// key the primitives augmentation registry's bags for the host/builder/environment
// receivers, so the reference `HostingAbstractionsHost*Extensions` /
// `HostEnvironmentEnvExtensions` sets register against them and the concrete
// `Host`/`HostBuilder`/`HostingEnvironment` classes (downstream in
// `@rhombus-std/hosting`) pull the members onto their prototypes.
//
// Values are plain `nameof`-format strings (`<package>:<TypeName>`); the
// transformer's `nameof<IHost>()` derives the identical literals.

/** Registry token for the `IHost` augmentation receiver. */
export const HOST_AUGMENTATION_TOKEN: Token = "@rhombus-std/hosting.core:IHost";

/** Registry token for the `IHostBuilder` augmentation receiver. */
export const HOST_BUILDER_AUGMENTATION_TOKEN: Token = "@rhombus-std/hosting.core:IHostBuilder";

/** Registry token for the `IHostEnvironment` augmentation receiver. */
export const HOST_ENVIRONMENT_AUGMENTATION_TOKEN: Token = "@rhombus-std/hosting.core:IHostEnvironment";

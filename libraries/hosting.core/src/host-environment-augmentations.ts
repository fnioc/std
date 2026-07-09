// Environment predicates -- ported from the reference's
// `HostEnvironmentEnvExtensions` static augmentation class. Authored as one named
// object literal per ME class (docs §28), `satisfies
// AugmentationSet<IHostEnvironment>`.
//
// OPEN receiver (docs §38): `IHostEnvironment` is a public host contract extended
// across packages, so this const registers into the augmentation registry under
// {@link HOST_ENVIRONMENT_AUGMENTATION_TOKEN}, beside its interface-side merge
// (rule 0.6). The concrete `HostingEnvironment` -- downstream in
// `@rhombus-std/hosting` -- is decorated with
// `@augment(HOST_ENVIRONMENT_AUGMENTATION_TOKEN)` and pulls this bag onto its
// prototype; the class-side merge stays downstream next to that class.

import type { AugmentationSet } from "@rhombus-std/primitives";
import { registerAugmentations } from "@rhombus-std/primitives";
import { Environments } from "./environments";
import type { IHostEnvironment } from "./host-environment";
import { HOST_ENVIRONMENT_AUGMENTATION_TOKEN } from "./tokens";

// The interface-side merge for the `IHostEnvironment` augmentation members lives
// HERE, beside the const (rule 0.6). The runtime install onto the concrete
// `HostingEnvironment` (and its class-side merge) live downstream.
declare module "./host-environment" {
  interface IHostEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

/** Compares the current host environment name against `environmentName` (case-insensitive). */
function isEnvironment(
  hostEnvironment: IHostEnvironment,
  environmentName: string,
): boolean {
  return hostEnvironment.environmentName.toLowerCase() === environmentName.toLowerCase();
}

/** Checks whether the current host environment name is {@link Environments.Development}. */
function isDevelopment(hostEnvironment: IHostEnvironment): boolean {
  return isEnvironment(hostEnvironment, Environments.Development);
}

/** Checks whether the current host environment name is {@link Environments.Staging}. */
function isStaging(hostEnvironment: IHostEnvironment): boolean {
  return isEnvironment(hostEnvironment, Environments.Staging);
}

/** Checks whether the current host environment name is {@link Environments.Production}. */
function isProduction(hostEnvironment: IHostEnvironment): boolean {
  return isEnvironment(hostEnvironment, Environments.Production);
}

/**
 * The `HostEnvironmentEnvExtensions` augmentation set for {@link IHostEnvironment}
 * (docs §28). Registered under {@link HOST_ENVIRONMENT_AUGMENTATION_TOKEN}; the
 * concrete `HostingEnvironment` downstream pulls it via `@augment`. The members
 * here are also the standalone call surface.
 */
export const HostEnvironmentEnvExtensions = {
  isEnvironment,
  isDevelopment,
  isStaging,
  isProduction,
} satisfies AugmentationSet<IHostEnvironment>;

registerAugmentations(HOST_ENVIRONMENT_AUGMENTATION_TOKEN, HostEnvironmentEnvExtensions);

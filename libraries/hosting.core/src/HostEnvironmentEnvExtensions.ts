// Environment predicates -- ported from the reference's
// `HostEnvironmentEnvExtensions` static augmentation class. Authored as one named
// object literal per ME class (docs §28), `satisfies
// AugmentationSet<IHostEnvironment>`.
//
// OPEN receiver (docs §38): `IHostEnvironment` is a public host contract extended
// across packages, so this const registers into the augmentation registry under
// the `IHostEnvironment` token, beside its interface-side merge
// (rule 0.6). The concrete `HostingEnvironment` -- downstream in
// `@rhombus-std/hosting` -- is decorated with
// `@augment(nameof<IHostEnvironment>())` and pulls this bag onto its
// prototype; the class-side merge stays downstream next to that class.

import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { Environments } from './Environments';
import type { IHostEnvironment } from './IHostEnvironment';

// The interface-side merge for the `IHostEnvironment` augmentation members lives
// HERE, beside the const (rule 0.6). The runtime install onto the concrete
// `HostingEnvironment` (and its class-side merge) live downstream.
declare module './IHostEnvironment' {
  interface IHostEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

/**
 * The `HostEnvironmentEnvExtensions` augmentation set for {@link IHostEnvironment}
 * (docs §28). Registered under the `IHostEnvironment` token; the
 * concrete `HostingEnvironment` downstream pulls it via `@augment`. The members
 * here are also the standalone call surface.
 */
export const HostEnvironmentEnvExtensions = {
  /** Compares the current host environment name against `environmentName` (case-insensitive). */
  isEnvironment(
    hostEnvironment: IHostEnvironment,
    environmentName: string,
  ): boolean {
    return hostEnvironment.environmentName.toLowerCase() === environmentName.toLowerCase();
  },

  /** Checks whether the current host environment name is {@link Environments.Development}. */
  isDevelopment(hostEnvironment: IHostEnvironment): boolean {
    return HostEnvironmentEnvExtensions.isEnvironment(hostEnvironment, Environments.Development);
  },

  /** Checks whether the current host environment name is {@link Environments.Staging}. */
  isStaging(hostEnvironment: IHostEnvironment): boolean {
    return HostEnvironmentEnvExtensions.isEnvironment(hostEnvironment, Environments.Staging);
  },

  /** Checks whether the current host environment name is {@link Environments.Production}. */
  isProduction(hostEnvironment: IHostEnvironment): boolean {
    return HostEnvironmentEnvExtensions.isEnvironment(hostEnvironment, Environments.Production);
  },
} satisfies AugmentationSet<IHostEnvironment>;

registerAugmentations(nameof<IHostEnvironment>(), HostEnvironmentEnvExtensions);

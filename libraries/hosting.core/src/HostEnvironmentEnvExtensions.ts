import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { Environments } from './Environments';
import type { IHostEnvironment } from './IHostEnvironment';

declare module './IHostEnvironment' {
  interface IHostEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

/** Augmentation set for {@link IHostEnvironment}; each member is also directly callable. */
export const HostEnvironmentEnvExtensions = {
  /** Compares the current host environment name against `environmentName` (case-insensitive). */
  isEnvironment(hostEnvironment: IHostEnvironment, environmentName: string): boolean {
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

registerAugmentations(tokenfor<IHostEnvironment>(), HostEnvironmentEnvExtensions);

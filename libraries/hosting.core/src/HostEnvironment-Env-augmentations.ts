import type { AugmentationSet2 } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { Environments } from './Environments';
import type { IHostEnvironment } from './IHostEnvironment';

type IHostEnvironmentEnvAugmentations = {
  /** Compares the current host environment name against `environmentName` (case-insensitive). */
  isEnvironment(environmentName: string): boolean;
  /** Checks whether the current host environment name is {@link Environments.Development}. */
  isDevelopment(): boolean;
  /** Checks whether the current host environment name is {@link Environments.Staging}. */
  isStaging(): boolean;
  /** Checks whether the current host environment name is {@link Environments.Production}. */
  isProduction(): boolean;
};

declare module '@rhombus-std/hosting.core' {
  interface IHostEnvironment extends IHostEnvironmentEnvAugmentations {}
}

/** Augmentation set for {@link IHostEnvironment}; each member is also directly callable. */
export const HostEnvironmentEnvAugmentations: AugmentationSet2<IHostEnvironment, IHostEnvironmentEnvAugmentations> = {
  isEnvironment(environmentName) {
    return this.environmentName.toLowerCase() === environmentName.toLowerCase();
  },
  isDevelopment() {
    return HostEnvironmentEnvAugmentations.isEnvironment.call(this, Environments.Development);
  },
  isStaging() {
    return HostEnvironmentEnvAugmentations.isEnvironment.call(this, Environments.Staging);
  },
  isProduction() {
    return HostEnvironmentEnvAugmentations.isEnvironment.call(this, Environments.Production);
  },
};

registerAugmentations<IHostEnvironment>(HostEnvironmentEnvAugmentations);

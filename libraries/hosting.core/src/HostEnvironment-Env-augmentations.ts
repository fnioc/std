import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { Environments } from './Environments';
import type { IHostEnvironment } from './IHostEnvironment';

export namespace HostEnvironmentEnvAugmentations {
  /** Compares the current host environment name against `environmentName` (case-insensitive). */
  export function isEnvironment(this: IHostEnvironment, environmentName: string): boolean {
    return this.environmentName.toLowerCase() === environmentName.toLowerCase();
  }
  /** Checks whether the current host environment name is {@link Environments.Development}. */
  export function isDevelopment(this: IHostEnvironment): boolean {
    return HostEnvironmentEnvAugmentations.isEnvironment.call(this, Environments.Development);
  }
  /** Checks whether the current host environment name is {@link Environments.Staging}. */
  export function isStaging(this: IHostEnvironment): boolean {
    return HostEnvironmentEnvAugmentations.isEnvironment.call(this, Environments.Staging);
  }
  /** Checks whether the current host environment name is {@link Environments.Production}. */
  export function isProduction(this: IHostEnvironment): boolean {
    return HostEnvironmentEnvAugmentations.isEnvironment.call(this, Environments.Production);
  }
}

declare module '@rhombus-std/hosting.core' {
  interface IHostEnvironment extends Flatten<typeof HostEnvironmentEnvAugmentations> {}
}

registerAugmentations<IHostEnvironment>(HostEnvironmentEnvAugmentations);

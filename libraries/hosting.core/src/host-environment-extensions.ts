// Environment predicates -- ported from the reference's HostEnvironmentEnv
// extension methods. IHostEnvironment is a plain interface with no concrete
// class here to prototype-patch, so these surface as named functions (see
// diNotes).

import { Environments } from "./environments";
import type { IHostEnvironment } from "./host-environment";

/** Compares the current host environment name against `environmentName` (case-insensitive). */
export function isEnvironment(
  hostEnvironment: IHostEnvironment,
  environmentName: string,
): boolean {
  return hostEnvironment.environmentName.toLowerCase() === environmentName.toLowerCase();
}

/** Checks whether the current host environment name is {@link Environments.Development}. */
export function isDevelopment(hostEnvironment: IHostEnvironment): boolean {
  return isEnvironment(hostEnvironment, Environments.Development);
}

/** Checks whether the current host environment name is {@link Environments.Staging}. */
export function isStaging(hostEnvironment: IHostEnvironment): boolean {
  return isEnvironment(hostEnvironment, Environments.Staging);
}

/** Checks whether the current host environment name is {@link Environments.Production}. */
export function isProduction(hostEnvironment: IHostEnvironment): boolean {
  return isEnvironment(hostEnvironment, Environments.Production);
}

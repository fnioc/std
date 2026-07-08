// Environment predicates -- ported from the reference's
// `HostEnvironmentEnvExtensions` static extension class. Authored as one named
// object literal per ME class (docs §28), `satisfies
// AugmentationSet<IHostEnvironment>`. IHostEnvironment is a plain interface with
// no concrete class in THIS abstractions package to prototype-patch, so the
// method-form install (and the `declare module` merge) live downstream in
// `@rhombus-std/hosting` against the concrete `HostingEnvironment`, per the
// cross-package rule -- here we only ship the literal (its members are the
// standalone call surface).

import type { AugmentationSet } from "@rhombus-std/primitives";
import { Environments } from "./environments";
import type { IHostEnvironment } from "./host-environment";

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
 * (docs §28). Installed as instance methods onto the concrete `HostingEnvironment`
 * downstream in `@rhombus-std/hosting`; the members here are the standalone call
 * surface.
 */
export const HostEnvironmentEnvExtensions = {
  isEnvironment,
  isDevelopment,
  isStaging,
  isProduction,
} satisfies AugmentationSet<IHostEnvironment>;

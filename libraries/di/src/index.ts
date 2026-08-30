// The taxonomy, re-exported so an entry point that already names the engine can
// catch what it throws without also naming the abstractions. di.core stays
// external in this bundle, so both specifiers reach ONE class per error and
// `instanceof` holds whichever one a caller imported from.
export { CaptiveDependencyError, CycleError, DiError, ManifestValidationError, UniversalAddressError, UnknownControlError, UnsatisfiableError } from '@rhombus-std/di.core';
export type { Middleware, ValidationFailure } from '@rhombus-std/di.core';

export { resolveAudit } from './addons/resolve-audit.js';
export { validateBuildability, validateUniversalAddresses } from './addons/validation.js';
export { type ContainerBuilder, di } from './di.js';
export * from './lifetime/index.js';

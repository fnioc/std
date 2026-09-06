// The taxonomy, re-exported so an entry point that already names the engine can
// catch what it throws without also naming the abstractions. di.core stays
// external in this bundle, so both specifiers reach ONE class per error and
// `instanceof` holds whichever one a caller imported from.
export { CycleError, DiError, NonPromiseThenableError, ObjectDisposedError, UniversalAddressError, UnsatisfiableError } from '@rhombus-std/di.core';
export type { Middleware } from '@rhombus-std/di.core';

export { ScopeValidationError, standardLifetime, validateScopes } from './addons/standard-lifetime/index.js';
export { taggedLifetime } from './addons/tagged-lifetime/index.js';
export { validateAddresses } from './addons/validate-addresses.js';
export { validateBuildability, validateUniversalAddresses } from './addons/validation.js';
export { Builder } from './di.js';

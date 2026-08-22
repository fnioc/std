// The taxonomy, re-exported so an entry point that already names the engine can
// catch what it throws without also naming the abstractions. di.core stays
// external in this bundle, so both specifiers reach ONE class per error and
// `instanceof` holds whichever one a caller imported from.
export { CycleError, DiError, ManifestValidationError, UnsatisfiableError } from '@rhombus-std/di.core';
export type { ValidationFailure } from '@rhombus-std/di.core';

export * from './ServiceProvider.js';
export { ServiceProviderOptions } from './ServiceProviderOptions.js';

import './augmentations';

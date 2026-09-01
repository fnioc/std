// The taxonomy, re-exported so an entry point that already names the engine can
// catch what it throws without also naming the abstractions. di.core stays
// external in this bundle, so both specifiers reach ONE class per error and
// `instanceof` holds whichever one a caller imported from.
export { CaptiveDependencyError, CycleError, DiError, ManifestValidationError, UniversalAddressError, UnknownControlError, UnsatisfiableError } from '@rhombus-std/di.core';
export type { Middleware, ValidationFailure } from '@rhombus-std/di.core';

export { auditAddon } from './addons/audit-addon.js';
export { type DiagnosticEdge, type DiagnosticPhase, type DiagnosticReading, diagnosticsAddon, type DiagnosticsAddonOptions, type DiagnosticsProbe } from './addons/diagnostics-addon.js';
export { validateBuildability, validateUniversalAddresses } from './addons/validation.js';
export { Builder } from './di.js';

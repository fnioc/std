// The token strings the manual dialect hand-writes, spelled EXACTLY as
// `@rhombus-std/di.transformer` derives them for the package-public
// `@rhombus-std/examples.contracts` types (`<import-specifier>:<exported-name>`).
// Writing the derived form by hand is what lets this library's registrations
// land under the same tokens the with-transformer library and apps resolve —
// the interop matrix's agreement, kept local so the type-only contracts package
// stays runtime-free.

/** `token(IGreeting)` — the shared collection element both libraries register at. */
export const GREETING_TOKEN = '@rhombus-std/examples.contracts:IGreeting';

/** `token(IHealthCheck)` — the optional service this library alone registers. */
export const HEALTH_CHECK_TOKEN = '@rhombus-std/examples.contracts:IHealthCheck';

// @rhombus-std/examples.lib.without-transformer — a dependency library authored
// in the MANUAL di dialect (explicit tokens + plain-data signatures, no
// transformer). It gets a real build for consistency and genuine consumption,
// but ordinary source-libs conditions are fine: nothing here needs lowering, so
// the raw source is already runnable.

export { addCasualServices } from "./add-casual-services.js";
export { CasualGreeting } from "./casual-greeting.js";
export { HealthCheck } from "./health-check.js";
export { GREETING_TOKEN, HEALTH_CHECK_TOKEN } from "./tokens.js";

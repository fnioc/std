// The token grammar that wires the OptionsFactory pipeline through the container.
//
// `addOptions`/`configure` key each pipeline slot (configure steps,
// post-configure steps, validate steps, change-token sources) at a token
// DERIVED from the options token the consumer resolves. Every slot is a
// collection: a step is appended with `addValue(<slot>, step)`, and the
// assembly resolves the whole list via the `Array<slot>` wrapper (#48 collection
// resolution). Deriving the slot tokens deterministically here is what lets
// `configure` (which appends) and `assembleOptions` (which reads) agree without
// sharing state — they travel through the container.

import type { Token } from "@rhombus-std/di.core";

// Namespaced so a derived slot token can never collide with a consumer's own
// registration token, whatever the options token happens to be.
const NAMESPACE = "@rhombus-std/options.augmentations";

/** The slot token whose collection holds the {@link ConfigureOptions} steps for `optionsToken`. */
export function configureStepToken(optionsToken: Token): Token {
  return `${NAMESPACE}/configure/${optionsToken}`;
}

/** The slot token whose collection holds the {@link PostConfigureOptions} steps for `optionsToken`. */
export function postConfigureStepToken(optionsToken: Token): Token {
  return `${NAMESPACE}/post-configure/${optionsToken}`;
}

/** The slot token whose collection holds the {@link ValidateOptions} steps for `optionsToken`. */
export function validateStepToken(optionsToken: Token): Token {
  return `${NAMESPACE}/validate/${optionsToken}`;
}

/** The slot token whose collection holds the change-token sources for `optionsToken`. */
export function changeTokenSourceToken(optionsToken: Token): Token {
  return `${NAMESPACE}/change-token-source/${optionsToken}`;
}

/**
 * The collection wrapper token for `elementToken` — the string the engine
 * recognizes as a collection request and aggregates every registration of the
 * element into (the same `Array<T>` derivation the transformer emits).
 */
export function collectionToken(elementToken: Token): Token {
  return `Array<${elementToken}>`;
}

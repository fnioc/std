// The token grammar wiring the OptionsFactory pipeline through the container.
// Each function derives a slot token from the options token; a step is appended
// with `addValue(<slot>, step)` and the assembly reads the whole list back
// through the collection wrapper. Deriving these deterministically is what lets
// the append side (`configure`) and the read side (`assembleOptions`) agree
// without sharing state.

// Namespaced so a derived slot token can never collide with a consumer's own
// registration token, whatever the options token happens to be.
const NAMESPACE = '@rhombus-std/options.augmentations';

/** The slot token whose collection holds the {@link IConfigureOptions} steps for `optionsToken`. */
export function configureStepToken(optionsToken: string): string {
  return `${NAMESPACE}/configure/${optionsToken}`;
}

/** The slot token whose collection holds the {@link IPostConfigureOptions} steps for `optionsToken`. */
export function postConfigureStepToken(optionsToken: string): string {
  return `${NAMESPACE}/post-configure/${optionsToken}`;
}

/** The slot token whose collection holds the {@link IValidateOptions} steps for `optionsToken`. */
export function validateStepToken(optionsToken: string): string {
  return `${NAMESPACE}/validate/${optionsToken}`;
}

/** The slot token whose collection holds the change-token sources for `optionsToken`. */
export function changeTokenSourceToken(optionsToken: string): string {
  return `${NAMESPACE}/change-token-source/${optionsToken}`;
}

/**
 * The single collection slot token holding every options token marked for
 * startup validation. `validateOnStart(token)` appends `token` here, and the
 * StartupValidator resolves the whole list to force each. Unlike the per-options
 * slots above this takes NO argument -- one flat list serves the whole container.
 */
export function startupValidationTargetToken(): string {
  return `${NAMESPACE}/startup-validation-target`;
}

/**
 * The collection wrapper token for `elementToken` — the string the resolver
 * recognizes as a request to aggregate every registration of the element.
 */
export function collectionToken(elementToken: string): string {
  return `Array<${elementToken}>`;
}

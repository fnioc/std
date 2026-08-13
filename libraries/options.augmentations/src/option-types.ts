// The type grammar wiring the OptionsFactory pipeline through the container.
// Each function derives a slot type from the options type; a step is appended
// with `addValue(<slot>, step)` and the assembly reads the whole list back
// through the collection wrapper. Deriving these deterministically is what lets
// the append side (`configure`) and the read side (`assembleOptions`) agree
// without sharing state.

import { Type } from '@rhombus-std/primitives';

// Namespaced so a derived slot can never collide with a consumer's own
// registration, whatever the options type happens to be.
const NAMESPACE = '@rhombus-std/options.augmentations';

/** The slot whose collection holds the {@link IConfigureOptions} steps for `optionsType`. */
export function configureStepType(optionsType: Type): Type {
  return Type.global(`${NAMESPACE}/configure`, [optionsType]);
}

/** The slot whose collection holds the {@link IPostConfigureOptions} steps for `optionsType`. */
export function postConfigureStepType(optionsType: Type): Type {
  return Type.global(`${NAMESPACE}/post-configure`, [optionsType]);
}

/** The slot whose collection holds the {@link IValidateOptions} steps for `optionsType`. */
export function validateStepType(optionsType: Type): Type {
  return Type.global(`${NAMESPACE}/validate`, [optionsType]);
}

/** The slot whose collection holds the change-token sources for `optionsType`. */
export function changeTokenSourceType(optionsType: Type): Type {
  return Type.global(`${NAMESPACE}/change-token-source`, [optionsType]);
}

/**
 * The single collection slot holding every options type marked for startup
 * validation. `validateOnStart(type)` appends `type` here, and the
 * StartupValidator resolves the whole list to force each. Unlike the per-options
 * slots above this takes NO argument -- one flat list serves the whole container.
 */
export function startupValidationTargetType(): Type {
  return Type.global(`${NAMESPACE}/startup-validation-target`);
}

/**
 * The collection wrapper for `element` — what the resolver recognizes as a
 * request to aggregate every registration of the element.
 */
export function collectionType(element: Type): Type {
  return Type.array(element);
}

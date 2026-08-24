// The service types wiring the OptionsFactory pipeline through the container.
// Each function composes the slot's real contract type from the options type; a
// step is registered under `<slot>(optionsType)` and the assembly reads the
// whole list back through `Type.array`. Deriving these deterministically is what
// lets the append side (`configure`) and the read side (`assembleOptions`) agree
// without sharing state.
//
// Every slot keys on the BARE `T`, never on `IOptions<T>`: one open registration
// serves the whole family and derives these from the type that closed it.

import { Type } from '@rhombus-std/primitives';

/** The `IConfigureOptions<optionsType>` contract — its collection holds the type's configure steps. */
export function configureStepType(optionsType: Type): Type {
  return Type.imported('IConfigureOptions', '@rhombus-std/options', [optionsType]);
}

/** The `IPostConfigureOptions<optionsType>` contract — its collection holds the type's post-configure steps. */
export function postConfigureStepType(optionsType: Type): Type {
  return Type.imported('IPostConfigureOptions', '@rhombus-std/options', [optionsType]);
}

/** The `IValidateOptions<optionsType>` contract — its collection holds the type's validate steps. */
export function validateStepType(optionsType: Type): Type {
  return Type.imported('IValidateOptions', '@rhombus-std/options', [optionsType]);
}

/** The `IOptionsChangeTokenSource<optionsType>` contract — its collection holds the type's reload sources. */
export function changeTokenSourceType(optionsType: Type): Type {
  return Type.imported('IOptionsChangeTokenSource', '@rhombus-std/options.augmentations', [optionsType]);
}

/**
 * The `() => optionsType` base factory every pipeline run starts from.
 *
 * @remarks
 * This slot is what OFFERS an options type. The single open `IOptions<$T>`
 * registration takes it as a dependency, so a type with nothing registered here
 * leaves that registration unlowerable and `resolve(IOptions<T>)` answers
 * `undefined` rather than assembling a value nobody asked for.
 */
export function baseFactoryType(optionsType: Type): Type {
  return Type.func(optionsType, [[]]);
}

/**
 * The address `IOptions<T>` resolves at.
 *
 * @remarks
 * The composed address is spelled HERE and nowhere else — every authoring verb
 * takes the bare `T`. Only the startup-validation target list needs it, because
 * `StartupValidator` resolves each target and reads `.value` off it.
 */
export function optionsAddressType(optionsType: Type): Type {
  return Type.imported('IOptions', '@rhombus-std/options', [optionsType]);
}

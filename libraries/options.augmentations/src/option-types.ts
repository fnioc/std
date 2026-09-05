// The service types wiring the OptionsFactory pipeline through the container.
// Each function composes the slot's real contract type from the options type; a
// step is registered under `<slot>(optionsType)` and the assembly reads the
// whole list back through `Type.array`. Deriving these deterministically is what
// lets the append side (`configure`) and the read side (`assembleOptions`) agree
// without sharing state.
//
// Every slot keys on the BARE `T`, never on `IOptions<T>`: one open registration
// serves the whole family and derives these from the type that closed it.

import type { IConfigureOptions, IOptions, IPostConfigureOptions, IValidateOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { type Generic, typefor } from '@rhombus-std/primitives.extras';

import type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';

/** The `IConfigureOptions<optionsType>` contract — its collection holds the type's configure steps. */
export function configureStepType(optionsType: Type): Type {
  return Type.substitute(typefor<IConfigureOptions<Generic<'T'>>>(), { T: optionsType });
}

/** The `IPostConfigureOptions<optionsType>` contract — its collection holds the type's post-configure steps. */
export function postConfigureStepType(optionsType: Type): Type {
  return Type.substitute(typefor<IPostConfigureOptions<Generic<'T'>>>(), { T: optionsType });
}

/** The `IValidateOptions<optionsType>` contract — its collection holds the type's validate steps. */
export function validateStepType(optionsType: Type): Type {
  return Type.substitute(typefor<IValidateOptions<Generic<'T'>>>(), { T: optionsType });
}

/** The `IOptionsChangeTokenSource<optionsType>` contract — its collection holds the type's reload sources. */
export function changeTokenSourceType(optionsType: Type): Type {
  return Type.substitute(typefor<IOptionsChangeTokenSource<Generic<'T'>>>(), { T: optionsType });
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
  return Type.substitute(typefor<IOptions<Generic<'T'>>>(), { T: optionsType });
}

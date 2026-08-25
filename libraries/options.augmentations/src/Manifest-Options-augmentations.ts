// The `addOptions` verb: offers `IOptions<any>` for an options type -- one
// open registration answering every `IOptions<…>` request, closed by
// whatever type asks. `postConfigure` and `validate` each return their own
// self-contained manifest for the caller to merge in with `addMany`. The
// `configure` step is the sibling ./configure-manifests set, and
// `validateOnStart` the sibling ./validate-on-start-manifests one.

import { Manifest } from '@rhombus-std/di.core';
import { type IPostConfigureOptions, type IValidateOptions, ValidateOptionsResult } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import type { DepTypes } from './dep-types.js';
import { ensureOpenOptions } from './open-options.js';
import { baseFactoryType, postConfigureStepType, validateStepType } from './option-types.js';

// `Lifetime` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /**
     * Offers `IOptions<any>` for the options type `optionsType`, taking its base
     * value from whatever `optionsType` itself resolves to.
     *
     * @remarks
     * `optionsType` is the BARE `any`, never `IOptions<any>`: one open registration
     * answers every `IOptions<…>` request, and this call is what makes it answer
     * for this type. Distinct from the pipeline overload below by its arity.
     */
    addOptions(optionsType: Type): Manifest<Lifetime>;
    /**
     * Offers `IOptions<any>` for the options type `optionsType`, building its
     * value through the pipeline: `makeBase` produces the instance each run
     * starts from, and every configure / post-configure / validate step and
     * change-token source registered for `optionsType` then applies to it.
     */
    addOptions(optionsType: Type, makeBase: Func<[], any>): Manifest<Lifetime>;
  }
}

export namespace ServiceManifestOptionsAugmentations {
  export function addOptions(this: Manifest<unknown>, optionsType: Type): Manifest<unknown>;
  export function addOptions(this: Manifest<unknown>, optionsType: Type, makeBase?: Func<[], any>): Manifest<unknown> {
    const manifest = ensureOpenOptions(this);
    // Both forms fill the same base slot, which is what offers this type; they
    // differ only in where the base value comes from. A given factory IS the
    // `() => T` the slot names, handed back as-is — a value registration.
    // Given nothing, the base is whatever `optionsType` itself resolves to,
    // injected here so the resolution is the container's, not ours.
    if (makeBase) {
      return manifest.addValue(baseFactoryType(optionsType), makeBase);
    }
    return manifest.add(
      baseFactoryType(optionsType),
      (value: any) => () => value,
      Type.func(baseFactoryType(optionsType), [[optionsType]]),
    );
  }
}

registerAugmentations<Manifest<unknown>>(ServiceManifestOptionsAugmentations);

/**
 * A post-configure step for `optionsType`, run after every configure step, as
 * its own manifest — merge it into a container's registrations with
 * `addMany`. Accepts a {@link IPostConfigureOptions} or a bare
 * `(options) => void` delegate.
 */
export function getPostConfigureManifest(optionsType: Type, step: IPostConfigureOptions<any> | Func<[any], void>): Manifest<unknown>;
/**
 * The DI-injected post-configure step: resolves each type in `depTypes` and
 * passes the instances to `configureOptions` after the options value —
 * collapsed the same way as the dependency form of `getConfigureManifest`.
 */
export function getPostConfigureManifest<Deps extends readonly unknown[]>(optionsType: Type, depTypes: DepTypes<Deps>, configureOptions: (options: any, ...deps: Deps) => void): Manifest<unknown>;
export function getPostConfigureManifest<Deps extends readonly unknown[]>(optionsType: Type, step: IPostConfigureOptions<any> | Func<[any], void> | DepTypes<Deps>,
  configureWithDeps?: (options: any, ...deps: Deps) => void): Manifest<unknown> {
  // DI-injected form: `step` is the dep-type tuple and `configureWithDeps`
  // the callback. Registers a factory for the post-configure slot whose
  // injected params are the resolved deps; it produces an
  // IPostConfigureOptions that forwards them after the options value. The
  // deps resolve once, when the assembly reads the slot.
  if (Array.isArray(step)) {
    const callback = configureWithDeps as (options: any, ...deps: Deps) => void;
    return Manifest.empty<unknown>().add(postConfigureStepType(optionsType), (...deps: Deps): IPostConfigureOptions<any> => ({ postConfigure(options: any): void {
      callback(options, ...deps);
    } }), Type.func(postConfigureStepType(optionsType), [[...step]]));
  }
  // A bare delegate is wrapped into an IPostConfigureOptions<any>; both append
  // to the type's post-configure slot, which `assembleOptions` reads and
  // runs after every configure step.
  const plain = step as IPostConfigureOptions<any> | Func<[any], void>;
  const wrapped: IPostConfigureOptions<any> = typeof plain === 'function' ? { postConfigure: plain } : plain;
  return Manifest.empty<unknown>().addValue(postConfigureStepType(optionsType), wrapped);
}

// Default message used when a `getValidateManifest` caller supplies none.
const DEFAULT_VALIDATION_FAILURE_MESSAGE = 'A validation error has occurred.';

/**
 * A validate step for `optionsType`, as its own manifest — merge it into a
 * container's registrations with `addMany`. `validate` runs against the
 * fully-configured value; a `false` result fails validation with
 * `failureMessage`.
 */
export function getValidateManifest(optionsType: Type, validate: Func<[options: any], boolean>, failureMessage?: string): Manifest<unknown>;
/**
 * The DI-injected validate step: resolves each type in `depTypes` and passes
 * the instances to `validate` after the options value; a `false` result
 * fails with `failureMessage` — collapsed the same way as the dependency form
 * of `getConfigureManifest`.
 */
export function getValidateManifest<Deps extends readonly unknown[]>(optionsType: Type, depTypes: DepTypes<Deps>, validate: Func<[options: any, ...deps: Deps], boolean>,
  failureMessage?: string): Manifest<unknown>;
export function getValidateManifest<Deps extends readonly unknown[]>(optionsType: Type, ...args: [Func<[any], boolean>, string?] | [DepTypes<Deps>, Func<[any], boolean>, string?]): Manifest<unknown> {
  const [depTypes, predicate, failureMessage] = Array.from(function*() {
    if (typeof args[0] === 'function') {
      yield undefined;
    }
    yield* args;
  }()) as [DepTypes<Deps> | undefined, Func<[options: any, ...deps: Deps], boolean>, string | undefined];

  // DI-injected form: `depTypes` is the dep-type tuple, `predicate` the
  // callback, `failureMessage` its message. Registers a factory whose
  // injected params are the resolved deps, producing an IValidateOptions
  // that forwards them after the options value.
  if (depTypes) {
    return Manifest.empty<unknown>().add(
      validateStepType(optionsType),
      (...deps: Deps): IValidateOptions<any> => ({
        validate(options: any): ValidateOptionsResult {
          return predicate(options, ...deps) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE);
        },
      }),
      Type.func(validateStepType(optionsType), [[...depTypes]]),
    );
  }
  // Wraps the predicate into an IValidateOptions<any> step appended to the
  // type's validate slot.
  const step: IValidateOptions<any> = {
    validate(options: any): ValidateOptionsResult {
      return predicate(options, ...([] as any)) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE);
    },
  };
  return Manifest.empty<unknown>().addValue(validateStepType(optionsType), step);
}

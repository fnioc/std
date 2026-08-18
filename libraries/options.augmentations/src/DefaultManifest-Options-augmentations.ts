// The `addOptions` / `postConfigure` / `validate` half of the pipeline authoring
// surface on di.core's registration builder. The `configure` half is the sibling
// ./ServiceManifest-OptionsConfig-augmentations set -- two sets rather than one
// because the registry's bag is a flat name namespace, so a receiver cannot take
// two contributions of one name from a single registration.

import type { Manifest } from '@rhombus-std/di.core';
import { type IPostConfigureOptions, type IValidateOptions, ValidateOptionsResult } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import type { DepTokens } from './dep-tokens.js';
import { ensureOpenOptions } from './open-options.js';
import { baseFactoryType, postConfigureStepType, validateStepType } from './option-types.js';

// `Scopes` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    /**
     * Offers `IOptions<any>` for the options type `type`, taking its base value
     * from whatever `type` itself resolves to.
     *
     * @remarks
     * `type` is the BARE `any`, never `IOptions<any>`: one open registration answers
     * every `IOptions<…>` request, and this call is what makes it answer for this
     * type. Distinct from the pipeline overload below by its arity.
     */
    addOptions(type: Type): Manifest<Scopes>;
    /**
     * Offers `IOptions<any>` for the options type `type`, building its value
     * through the pipeline: `makeBase` produces the instance each run starts from,
     * and every configure / post-configure / validate step and change-token source
     * registered for `type` then applies to it.
     */
    addOptions(type: Type, makeBase: Func<[], any>): Manifest<Scopes>;

    /**
     * Registers a post-configure step for `type`, run after every
     * configure step. Accepts a {@link IPostConfigureOptions} or a bare
     * `(options) => void` delegate.
     */
    postConfigure(type: Type, step: IPostConfigureOptions<any> | Func<[any], void>): Manifest<Scopes>;
    /**
     * The DI-injected post-configure step: resolves each token in `depTokens`
     * and passes the instances to `configureOptions` after the options value
     * — collapsed the same way as the dependency form of {@link configure}
     * above.
     */
    postConfigure<Deps extends readonly unknown[]>(type: Type, depTokens: DepTokens<Deps>, configureOptions: (options: any, ...deps: Deps) => void): Manifest<Scopes>;

    /**
     * Registers a validate step for `type`: `validate` runs against the
     * fully-configured value; a `false` result fails validation with
     * `failureMessage`.
     */
    validate(type: Type, validate: Func<[any], boolean>, failureMessage?: string): Manifest<Scopes>;

    /**
     * The DI-injected validate step: resolves each token in `depTokens` and
     * passes the instances to `validate` after the options value; a `false`
     * result fails with `failureMessage` — collapsed the same way as the
     * dependency form of {@link configure} above.
     */
    validate<Deps extends readonly unknown[]>(type: Type, depTokens: DepTokens<Deps>, validate: (options: any, ...deps: Deps) => boolean, failureMessage?: string): Manifest<Scopes>;
  }
}

// Default message used when a `validate` caller supplies none.
const DEFAULT_VALIDATION_FAILURE_MESSAGE = 'A validation error has occurred.';

export namespace ServiceManifestOptionsAugmentations {
  export function addOptions(this: Manifest<string>, type: Type): Manifest<string>;
  export function addOptions(this: Manifest<string>, type: Type, makeBase?: Func<[], any>): Manifest<string> {
    const manifest = ensureOpenOptions(this);
    // Both forms fill the same base slot, which is what offers this type; they
    // differ only in where the base value comes from. Given a factory it is
    // that factory; given nothing, the base is whatever `any` itself resolves
    // to, injected here so the resolution is the container's, not ours.
    if (makeBase) {
      return manifest.add(baseFactoryType(type), makeBase);
    }
    return manifest.add(
      baseFactoryType(type),
      (value: any) => () => value,
      Type.func({ return: baseFactoryType(type), args: [[type]] }),
    );
  }

  export function postConfigure(this: Manifest<string>, type: Type, step: IPostConfigureOptions<any> | Func<[any], void>): Manifest<string>;
  export function postConfigure<Deps extends readonly unknown[]>(this: Manifest<string>, type: Type, depTokens: DepTokens<Deps>,
    configureOptions: (options: any, ...deps: Deps) => void): Manifest<string>;
  export function postConfigure<Deps extends readonly unknown[]>(this: Manifest<string>, type: Type, step: IPostConfigureOptions<any> | Func<[any], void> | DepTokens<Deps>,
    configureWithDeps?: (options: any, ...deps: Deps) => void): Manifest<string> {
    // DI-injected form: `step` is the dep-token tuple and `configureWithDeps`
    // the callback. Registers a factory for the post-configure slot whose
    // injected params are the resolved deps; it produces an
    // IPostConfigureOptions that forwards them after the options value. The
    // deps resolve once, when the assembly reads the slot.
    if (Array.isArray(step)) {
      const callback = configureWithDeps as (options: any, ...deps: Deps) => void;
      return this.add(postConfigureStepType(type), (...deps: Deps): IPostConfigureOptions<any> => ({ postConfigure(options: any): void {
        callback(options, ...deps);
      } }), Type.func(postConfigureStepType(type), [[...step]]));
    }
    // A bare delegate is wrapped into an IPostConfigureOptions<any>; both append
    // to the type's post-configure slot, which `assembleOptions` reads and
    // runs after every configure step.
    const plain = step as IPostConfigureOptions<any> | Func<[any], void>;
    const wrapped: IPostConfigureOptions<any> = typeof plain === 'function' ? { postConfigure: plain } : plain;
    return this.add(postConfigureStepType(type), wrapped);
  }

  export function validate(this: Manifest<string>, type: Type, validate: Func<[options: any], boolean>, failureMessage?: string): Manifest<string>;
  export function validate<Deps extends readonly unknown[]>(this: Manifest<string>, type: Type, depTokens: DepTokens<Deps>, validate: Func<[options: any, ...deps: Deps], boolean>,
    failureMessage?: string): Manifest<string>;
  export function validate<Deps extends readonly unknown[]>(this: Manifest<string>, type: Type,
    ...args: [Func<[any], boolean>, string?] | [DepTokens<Deps>, Func<[any], boolean>, string?]): Manifest<string> {
    const [depTypes, predicate, failureMessage] = Array.from(function*() {
      if (typeof args[0] === 'function') {
        yield undefined;
      }
      yield* args;
    }()) as [DepTokens<Deps> | undefined, Func<[options: any, ...deps: Deps], boolean>, string | undefined];

    // DI-injected form: `validateOrDeps` is the dep-token tuple,
    // `failureMessageOrValidate` the predicate, `failureMessage` its message.
    // Registers a factory whose injected params are the resolved deps,
    // producing an IValidateOptions that forwards them after the options value.
    if (depTypes) {
      return this.add(
        validateStepType(type),
        (...deps: Deps): IValidateOptions<any> => ({
          validate(options: any): ValidateOptionsResult {
            return predicate(options, ...deps) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE);
          },
        }),
        Type.func(validateStepType(type), [[...depTypes]]),
      );
    }
    // Wraps the predicate into an IValidateOptions<any> step appended to the
    // type's validate slot.
    const step: IValidateOptions<any> = {
      validate(options: any): ValidateOptionsResult {
        return predicate(options, ...([] as any)) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE);
      },
    };
    return this.add(validateStepType(type), step);
  }
}

registerAugmentations<Manifest<any>>(ServiceManifestOptionsAugmentations);

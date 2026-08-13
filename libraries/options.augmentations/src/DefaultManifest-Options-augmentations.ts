// The `addOptions` / `postConfigure` / `validate` half of the pipeline authoring
// surface on di.core's registration builder. The `configure` half is the sibling
// ./ServiceManifest-OptionsConfig-augmentations set -- two sets rather than one
// because the registry's bag is a flat name namespace, so a receiver cannot take
// two contributions of one name from a single registration.

import { DefaultManifest, type Manifest } from '@rhombus-std/di.core';
import { type IPostConfigureOptions, type IValidateOptions, ValidateOptionsResult } from '@rhombus-std/options';
import { type AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import type { DepTokens } from './dep-tokens.js';
import { ensureOpenOptions } from './open-options.js';
import { baseFactoryType, postConfigureStepType, validateStepType } from './option-types.js';

// Default message used when a `validate` caller supplies none.
const DEFAULT_VALIDATION_FAILURE_MESSAGE = 'A validation error has occurred.';

type IManifestOptionsAugmentations<Scopes extends string> = {
  /**
   * Offers `IOptions<T>` for the options type `tType`, taking its base value
   * from whatever `tType` itself resolves to.
   *
   * @remarks
   * `tType` is the BARE `T`, never `IOptions<T>`: one open registration answers
   * every `IOptions<…>` request, and this call is what makes it answer for this
   * type. Distinct from the pipeline overload below by its arity.
   */
  addOptions(tType: Type | string): Manifest<Scopes>; /**
   * Offers `IOptions<T>` for the options type `tType`, building its value
   * through the pipeline: `makeBase` produces the instance each run starts from,
   * and every configure / post-configure / validate step and change-token source
   * registered for `tType` then applies to it.
   */
  addOptions<T>(tType: Type | string, makeBase: Func<[], T>): Manifest<Scopes>; /**
   * Registers a post-configure step for `tType`, run after every
   * configure step. Accepts a {@link IPostConfigureOptions} or a bare
   * `(options) => void` delegate.
   */
  postConfigure<T>(tType: Type | string, step: IPostConfigureOptions<T> | Func<[T], void>): Manifest<Scopes>; /**
   * The DI-injected post-configure step: resolves each token in `depTokens`
   * and passes the instances to `configureOptions` after the options value
   * — collapsed the same way as the dependency form of {@link configure}
   * above.
   */
  postConfigure<T, Deps extends readonly unknown[]>(tType: Type | string, depTokens: DepTokens<Deps>,
    configureOptions: (options: T, ...deps: Deps) => void): Manifest<Scopes>; /**
   * Registers a validate step for `tType`: `validate` runs against the
   * fully-configured value; a `false` result fails validation with
   * `failureMessage`.
   */
  validate<T>(tType: Type | string, validate: Func<[T], boolean>, failureMessage?: string): Manifest<Scopes>; /**
   * The DI-injected validate step: resolves each token in `depTokens` and
   * passes the instances to `validate` after the options value; a `false`
   * result fails with `failureMessage` — collapsed the same way as the
   * dependency form of {@link configure} above.
   */
  validate<T, Deps extends readonly unknown[]>(tType: Type | string, depTokens: DepTokens<Deps>,
    validate: (options: T, ...deps: Deps) => boolean, failureMessage?: string): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the members do not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends IManifestOptionsAugmentations<Scopes> {}
}

// The overloads live on the member map above -- the signature's source of truth;
// the impls below carry the disambiguating unions.
export const ServiceManifestOptionsAugmentations: AugmentationSet2<DefaultManifest<string>,
  IManifestOptionsAugmentations<string>> = {
    addOptions<T>(this: DefaultManifest<string>, tType: Type | string, makeBase?: Func<[], T>): Manifest<string> {
      const type = typeof tType === 'string' ? Type.from(tType) : tType;
      const m = ensureOpenOptions(this);
      // Both forms fill the same base slot, which is what offers this type; they
      // differ only in where the base value comes from. Given a factory it is
      // that factory; given nothing, the base is whatever `T` itself resolves
      // to, injected here so the resolution is the container's, not ours.
      if (makeBase) {
        return m.addValue(baseFactoryType(type), makeBase);
      }
      return m.addFactory(baseFactoryType(type), (value: T): Func<[], T> => () => value,
        Type.func(baseFactoryType(type), type));
    },
    postConfigure<T, Deps extends readonly unknown[]>(this: DefaultManifest<string>, tType: Type | string,
      step: IPostConfigureOptions<T> | Func<[T], void> | DepTokens<Deps>,
      configureWithDeps?: (options: T, ...deps: Deps) => void): Manifest<string> {
      const type = typeof tType === 'string' ? Type.from(tType) : tType;
      // DI-injected form: `step` is the dep-token tuple and `configureWithDeps`
      // the callback. Registers a factory for the post-configure slot whose
      // injected params are the resolved deps; it produces an
      // IPostConfigureOptions that forwards them after the options value. The
      // deps resolve once, when the assembly reads the slot.
      if (Array.isArray(step)) {
        const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
        const depTypes = (step as readonly (Type | string)[]).map(dep =>
          typeof dep === 'string' ? Type.from(dep) : dep
        );
        return this.addFactory(postConfigureStepType(type),
          (...deps: Deps): IPostConfigureOptions<T> => ({ postConfigure(options: T): void {
            callback(options, ...deps);
          } }), Type.func(postConfigureStepType(type), ...depTypes));
      }
      // A bare delegate is wrapped into an IPostConfigureOptions<T>; both append
      // to the type's post-configure slot, which `assembleOptions` reads and
      // runs after every configure step.
      const plain = step as IPostConfigureOptions<T> | Func<[T], void>;
      const wrapped: IPostConfigureOptions<T> = typeof plain === 'function' ? { postConfigure: plain } : plain;
      return this.addValue(postConfigureStepType(type), wrapped);
    },
    validate<T, Deps extends readonly unknown[]>(this: DefaultManifest<string>, tType: Type | string,
      validateOrDeps: Func<[T], boolean> | DepTokens<Deps>,
      failureMessageOrValidate?: string | ((options: T, ...deps: Deps) => boolean),
      failureMessage?: string): Manifest<string> {
      const type = typeof tType === 'string' ? Type.from(tType) : tType;
      // DI-injected form: `validateOrDeps` is the dep-token tuple,
      // `failureMessageOrValidate` the predicate, `failureMessage` its message.
      // Registers a factory whose injected params are the resolved deps,
      // producing an IValidateOptions that forwards them after the options value.
      if (Array.isArray(validateOrDeps)) {
        const predicate = failureMessageOrValidate as (options: T, ...deps: Deps) => boolean;
        const message = failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE;
        const depTypes = (validateOrDeps as readonly (Type | string)[]).map(dep =>
          typeof dep === 'string' ? Type.from(dep) : dep
        );
        return this.addFactory(validateStepType(type),
          (...deps: Deps): IValidateOptions<T> => ({ validate(options: T): ValidateOptionsResult {
            return predicate(options, ...deps) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(message);
          } }), Type.func(validateStepType(type), ...depTypes));
      }
      // Wraps the predicate into an IValidateOptions<T> step appended to the
      // type's validate slot.
      const validateFn = validateOrDeps as Func<[T], boolean>;
      const message = (failureMessageOrValidate as string | undefined) ?? DEFAULT_VALIDATION_FAILURE_MESSAGE;
      const step: IValidateOptions<T> = { validate(options: T): ValidateOptionsResult {
        return validateFn(options) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(message);
      } };
      return this.addValue(validateStepType(type), step);
    },
  };

registerAugmentations(typefor<Manifest>(), ServiceManifestOptionsAugmentations);

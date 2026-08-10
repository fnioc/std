// The `addOptions` / `postConfigure` / `validate` half of the pipeline authoring
// surface on di.core's registration builder. The `configure` half is the sibling
// ./ServiceManifest-OptionsConfig-augmentations set -- two sets rather than one
// because the registry's bag is a flat name namespace, so a receiver cannot take
// two contributions of one name from a single registration.

import { type AddChain, type IServiceManifest, RESOLVER_TOKEN, ServiceManifestClass,
  type Token } from '@rhombus-std/di.core';
import { type IPostConfigureOptions, type IValidateOptions, Options,
  ValidateOptionsResult } from '@rhombus-std/options';
import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { assembleOptions } from './assemble-options.js';
import type { DepTokens } from './dep-tokens.js';
import { postConfigureStepToken, validateStepToken } from './option-tokens.js';

// Default message used when a `validate` caller supplies none.
const DEFAULT_VALIDATION_FAILURE_MESSAGE = 'A validation error has occurred.';

type IServiceManifestOptionsAugmentations<Scopes extends string> = {
  /**
   * Registers an `IOptions<T>` at `token` that wraps the `T` resolved from
   * `tToken`.
   *
   * @remarks
   * Distinct from the pipeline overload below by its second argument's
   * type: a `Token` (string) here, a `() => T` base factory there. Returns
   * the `.as(scope)` continuation so the lifetime is chosen at the
   * registration site.
   */
  addOptions(token: Token, tToken: Token): AddChain<Scopes, 'scope' | 'key', false>; /**
   * Registers the `IOptions<T>` assembly for `token`: resolving `token`
   * assembles the value from all configure/post-configure/validate steps and
   * change-token sources registered for it (the OptionsFactory pipeline).
   * `makeBase` produces the base instance each pipeline run starts from.
   * Returns the `.as(scope)` continuation so the lifetime is chosen at the
   * registration site.
   */
  addOptions<T>(token: Token, makeBase: Func<[], T>): AddChain<Scopes, 'scope' | 'key', false>; /**
   * Registers a post-configure step for `token`, run after every configure
   * step. Accepts a {@link IPostConfigureOptions} or a bare
   * `(options) => void` delegate.
   */
  postConfigure<T>(token: Token, step: IPostConfigureOptions<T> | Func<[T], void>): IServiceManifest<Scopes>; /**
   * The DI-injected post-configure step: resolves each token in `depTokens`
   * and passes the instances to `configureOptions` after the options value
   * — collapsed the same way as the dependency form of {@link configure}
   * above.
   */
  postConfigure<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
    configureOptions: (options: T, ...deps: Deps) => void): IServiceManifest<Scopes>; /**
   * Registers a validate step for `token`: `validate` runs against the
   * fully-configured value; a `false` result fails validation with
   * `failureMessage`.
   */
  validate<T>(token: Token, validate: Func<[T], boolean>, failureMessage?: string): IServiceManifest<Scopes>; /**
   * The DI-injected validate step: resolves each token in `depTokens` and
   * passes the instances to `validate` after the options value; a `false`
   * result fails with `failureMessage` — collapsed the same way as the
   * dependency form of {@link configure} above.
   */
  validate<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
    validate: (options: T, ...deps: Deps) => boolean, failureMessage?: string): IServiceManifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the members do not name it.
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown>
    extends IServiceManifestOptionsAugmentations<Scopes> {}
}

// The overloads live on the member map above -- the signature's source of truth;
// the impls below carry the disambiguating unions.
export const ServiceManifestOptionsAugmentations: AugmentationSet2<ServiceManifestClass<string>,
  IServiceManifestOptionsAugmentations<string>> = {
    addOptions<T>(manifest: ServiceManifestClass<string>, token: Token,
      source: Token | Func<[], T>): AddChain<string, 'scope' | 'key', false> {
      // Two verbs share the name, disambiguated by the second argument:
      //   - a `Token` (string)      → wrap the already-bound `T` resolved from it.
      //   - a `() => T` base factory → run the OptionsFactory assembly pipeline
      //     over the steps/sources registered for `token`.
      if (typeof source === 'function') {
        return manifest.addFactory(token, (resolver) => assembleOptions(resolver, token, source), [[RESOLVER_TOKEN]]);
      }
      return manifest.addFactory(token, (t: T) => Options.of(t), [[source]]);
    },
    postConfigure<T, Deps extends readonly unknown[]>(manifest: ServiceManifestClass<string>, token: Token,
      step: IPostConfigureOptions<T> | Func<[T], void> | DepTokens<Deps>,
      configureWithDeps?: (options: T, ...deps: Deps) => void): IServiceManifest<string> {
      // DI-injected form: `step` is the dep-token tuple and `configureWithDeps`
      // the callback. Registers a factory for the post-configure slot whose
      // injected params are the resolved deps; it produces an
      // IPostConfigureOptions that forwards them after the options value. The
      // deps resolve once, when the assembly reads the slot.
      if (Array.isArray(step)) {
        const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
        return manifest.addFactory(postConfigureStepToken(token),
          (...deps: Deps): IPostConfigureOptions<T> => ({ postConfigure(options: T): void {
            callback(options, ...deps);
          } }), [step as readonly Token[]]);
      }
      // A bare delegate is wrapped into an IPostConfigureOptions<T>; both append
      // to the token's post-configure slot, which `assembleOptions` reads and
      // runs after every configure step.
      const plain = step as IPostConfigureOptions<T> | Func<[T], void>;
      const wrapped: IPostConfigureOptions<T> = typeof plain === 'function' ? { postConfigure: plain } : plain;
      return manifest.addValue(postConfigureStepToken(token), wrapped);
    },
    validate<T, Deps extends readonly unknown[]>(manifest: ServiceManifestClass<string>, token: Token,
      validateOrDeps: Func<[T], boolean> | DepTokens<Deps>,
      failureMessageOrValidate?: string | ((options: T, ...deps: Deps) => boolean),
      failureMessage?: string): IServiceManifest<string> {
      // DI-injected form: `validateOrDeps` is the dep-token tuple,
      // `failureMessageOrValidate` the predicate, `failureMessage` its message.
      // Registers a factory whose injected params are the resolved deps,
      // producing an IValidateOptions that forwards them after the options value.
      if (Array.isArray(validateOrDeps)) {
        const predicate = failureMessageOrValidate as (options: T, ...deps: Deps) => boolean;
        const message = failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE;
        return manifest.addFactory(validateStepToken(token),
          (...deps: Deps): IValidateOptions<T> => ({ validate(options: T): ValidateOptionsResult {
            return predicate(options, ...deps) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(message);
          } }), [validateOrDeps as readonly Token[]]);
      }
      // Wraps the predicate into an IValidateOptions<T> step appended to the
      // token's validate slot.
      const validateFn = validateOrDeps as Func<[T], boolean>;
      const message = (failureMessageOrValidate as string | undefined) ?? DEFAULT_VALIDATION_FAILURE_MESSAGE;
      const step: IValidateOptions<T> = { validate(options: T): ValidateOptionsResult {
        return validateFn(options) ? ValidateOptionsResult.success : ValidateOptionsResult.fail(message);
      } };
      return manifest.addValue(validateStepToken(token), step);
    },
  };

registerAugmentations(tokenfor<IServiceManifest>(), ServiceManifestOptionsAugmentations);

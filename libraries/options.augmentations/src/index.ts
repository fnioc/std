// The config -> Options bridge: installs fluent authoring methods onto
// di.core's registration builder via the augmentation pattern (TS declaration
// merging + a runtime prototype assignment through the OPEN-set registry),
// the same mechanism @rhombus-std/config.json uses to add `addJsonFile` to
// ConfigBuilder:
//
//   - `addOptions<T>(token, makeBase)` -- registers the `IOptions<T>` assembly
//     (the OptionsFactory pipeline) for `token`. Returns the `.as(scope)`
//     continuation so the consumer picks the registration lifetime.
//   - `configure(token, section)` -- registers a config-bind configure step
//     PLUS a change-token source wired to the section's reload token, so the
//     delivered `IOptions<T>` binds the section and reacts to reloads.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/options.augmentations";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.
//
// di and config stay mutually unaware -- the bridge code lives ONLY here.

import type { IConfig } from '@rhombus-std/config.core';
// `AddChain` and `Token` are named imports (not member references inside the
// augmentation block) because unqualified names in a `declare module` body
// resolve in THIS file's scope.
import { type AddChain, type IServiceManifest, RESOLVER_TOKEN, ServiceManifestClass,
  type Token } from '@rhombus-std/di.core';
import { type IConfigureOptions, type IPostConfigureOptions, type IValidateOptions, Options,
  ValidateOptionsResult } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { assembleOptions } from './assemble-options.js';
import { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
import { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
import { changeTokenSourceToken, configureStepToken, postConfigureStepToken,
  validateStepToken } from './option-tokens.js';

// Default message used when a `validate` caller supplies none.
const DEFAULT_VALIDATION_FAILURE_MESSAGE = 'A validation error has occurred.';

// A same-length tuple of dependency-token strings, one per entry in `Deps` -- the
// token list a DI-injected pipeline step (the `configure`/`postConfigure`/
// `validate` dependency forms below) resolves from the provider before invoking
// its callback. A typed caller writes `[tokenfor<Dep1>(), tokenfor<Dep2>()]`.
type DepTokens<Deps extends readonly unknown[]> = { [K in keyof Deps]: Token; };

// The authored methods merge onto core's `IServiceManifestBase` interface -- the
// surface the public `ServiceManifest` (`= IServiceManifestBase<…>`) a consumer
// holds resolves to -- AND onto the concrete `ServiceManifestClass`, so the
// class still SATISFIES `implements IServiceManifestBase` once these NEW method
// names are on the interface. (di.extras only merges OVERLOADS of existing
// methods, so it needs no class-side merge; a brand-new name does.) `Provider`
// is defaulted so each merge matches its target's type-parameter list (TS2428
// requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
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
    addOptions(token: Token, tToken: Token): AddChain<Scopes, 'scope' | 'key', false>;
    /**
     * Registers the `IOptions<T>` assembly for `token`: resolving `token`
     * assembles the value from all configure/post-configure/validate steps and
     * change-token sources registered for it (the OptionsFactory pipeline).
     * `makeBase` produces the base instance each pipeline run starts from.
     * Returns the `.as(scope)` continuation so the lifetime is chosen at the
     * registration site.
     */
    addOptions<T>(token: Token, makeBase: Func<[], T>): AddChain<Scopes, 'scope' | 'key', false>;
    /**
     * Registers a configuration `section` to bind against the options
     * identified by `token`: adds a config-bind configure step and a
     * change-token source wired to the section's reload token. Requires a prior
     * {@link addOptions} for the same `token`.
     */
    configure(token: Token, section: IConfig): IServiceManifest<Scopes>;
    /**
     * Registers a code configure step for `token`: `configureOptions` runs
     * against the value as one configure source among several (no config
     * section, so no change-token source). Distinguished from the
     * config-section overload of {@link configure} by its function argument.
     */
    configure<T>(token: Token, configureOptions: Func<[T], void>): IServiceManifest<Scopes>;
    /**
     * The DI-injected configure step: resolves each token in `depTokens` from
     * the provider at materialization time and passes the instances to
     * `configureOptions` after the options value. A typed caller writes each
     * token as `tokenfor<Dep>()`.
     */
    configure<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void): IServiceManifest<Scopes>;
    /**
     * Registers a post-configure step for `token`, run after every configure
     * step. Accepts a {@link IPostConfigureOptions} or a bare
     * `(options) => void` delegate.
     */
    postConfigure<T>(token: Token, step: IPostConfigureOptions<T> | Func<[T], void>): IServiceManifest<Scopes>;
    /**
     * The DI-injected post-configure step: resolves each token in `depTokens`
     * and passes the instances to `configureOptions` after the options value
     * — collapsed the same way as the dependency form of {@link configure}
     * above.
     */
    postConfigure<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void): IServiceManifest<Scopes>;
    /**
     * Registers a validate step for `token`: `validate` runs against the
     * fully-configured value; a `false` result fails validation with
     * `failureMessage`.
     */
    validate<T>(token: Token, validate: Func<[T], boolean>, failureMessage?: string): IServiceManifest<Scopes>;
    /**
     * The DI-injected validate step: resolves each token in `depTokens` and
     * passes the instances to `validate` after the options value; a `false`
     * result fails with `failureMessage` — collapsed the same way as the
     * dependency form of {@link configure} above.
     */
    validate<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
      validate: (options: T, ...deps: Deps) => boolean, failureMessage?: string): IServiceManifest<Scopes>;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    addOptions(token: Token, tToken: Token): AddChain<Scopes, 'scope' | 'key', false>;
    addOptions<T>(token: Token, makeBase: Func<[], T>): AddChain<Scopes, 'scope' | 'key', false>;
    configure(token: Token, section: IConfig): IServiceManifest<Scopes>;
    configure<T>(token: Token, configureOptions: Func<[T], void>): IServiceManifest<Scopes>;
    configure<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void): IServiceManifest<Scopes>;
    postConfigure<T>(token: Token, step: IPostConfigureOptions<T> | Func<[T], void>): IServiceManifest<Scopes>;
    postConfigure<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void): IServiceManifest<Scopes>;
    validate<T>(token: Token, validate: Func<[T], boolean>, failureMessage?: string): IServiceManifest<Scopes>;
    validate<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
      validate: (options: T, ...deps: Deps) => boolean, failureMessage?: string): IServiceManifest<Scopes>;
  }
}

// Two object literals over the same receiver: `addOptions`/`postConfigure`/
// `validate` in one, `configure` in the other. Each is registered into the
// OPEN-set augmentation registry (below) so the decorated
// `ServiceManifestClass` mounts its members as prototype methods (the primary
// path); the const is also exported so the member is the standalone form. The
// overloads/generics live on the declare-module merge above (the method
// signature's source of truth); the member impls carry the disambiguating
// unions.
export const OptionsServiceManifestAugmentations = {
  addOptions<T>(manifest: ServiceManifestClass<string>, token: Token,
    source: Token | Func<[], T>
  ): AddChain<string, 'scope' | 'key', false> {
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
    configureWithDeps?: (options: T, ...deps: Deps) => void): IServiceManifest<string>
  {
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
    failureMessage?: string
  ): IServiceManifest<string> {
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
} satisfies AugmentationSet<ServiceManifestClass<string>>;

export const OptionsConfigServiceManifestAugmentations = {
  configure<T, Deps extends readonly unknown[]>(manifest: ServiceManifestClass<string>, token: Token,
    source: IConfig | Func<[T], void> | DepTokens<Deps>,
    configureWithDeps?: (options: T, ...deps: Deps) => void
  ): IServiceManifest<string> {
    // DI-injected form: `source` is the dep-token tuple and
    // `configureWithDeps` the callback. Registers a factory for the configure
    // slot whose injected params are the resolved deps; it produces an
    // IConfigureOptions that forwards them after the options value. The deps
    // resolve once, when the assembly reads the slot.
    if (Array.isArray(source)) {
      const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
      return manifest.addFactory(configureStepToken(token),
        (...deps: Deps): IConfigureOptions<T> => ({ configure(options: T): void {
          callback(options, ...deps);
        } }), [source as readonly Token[]]);
    }
    // A bare delegate is a pure code configure step: registers only the
    // configure slot, no change-token source. The registry's flat bag
    // namespace forbids a second `configure` member on the token, so the
    // config-section member absorbs the delegate by arg type — the same
    // disambiguation `addOptions` uses.
    const configSource = source as IConfig | Func<[T], void>;
    if (typeof configSource === 'function') {
      return manifest.addValue(configureStepToken(token), { configure: configSource });
    }
    let m: IServiceManifest<string> = manifest.addValue(configureStepToken(token),
      new ConfigConfigureOptions(configSource));
    m = m.addValue(changeTokenSourceToken(token), new ConfigChangeTokenSource(configSource));
    return m;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

// OPEN set: both consts target ServiceManifest, extended by many downstream
// packages, so they register into the primitives augmentation registry beside
// this declare-module merge. The `ServiceManifestClass` decorated with the
// same token (di.core) pulls these members onto its prototype.
registerAugmentations(tokenfor<IServiceManifest>(), OptionsServiceManifestAugmentations);
registerAugmentations(tokenfor<IServiceManifest>(), OptionsConfigServiceManifestAugmentations);

// `validateOnStart` lives in its own file (OptionsBuilderExtensions.ts); the
// re-export executes that module, so its `registerAugmentations` side effect
// installs the verb onto the manifest.
export { OptionsBuilderExtensions } from './OptionsBuilderExtensions.js';

export { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
export { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
// The slot-token grammar is public surface: the per-options configure /
// post-configure / validate steps and change-token sources are ordinary OPEN
// service contracts — any downstream package may register an implementation
// for a TOptions it doesn't own (logging.config registers both a custom
// configure step and a change-token source that way). The derived slot token
// IS that contract, so the derivation functions are exported: a downstream
// package appends a step with `services.addValue(configureStepToken(token),
// step)` (or `add`/`addFactory` for a lazily-constructed step), and the
// assembly for `token` picks it up like any `configure(...)`-registered one.
export type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';
export { changeTokenSourceToken, configureStepToken, postConfigureStepToken, startupValidationTargetToken,
  validateStepToken } from './option-tokens.js';

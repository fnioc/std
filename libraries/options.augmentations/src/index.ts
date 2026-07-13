// Public entry point for @rhombus-std/options.augmentations -- the config -> Options
// bridge (MEO's Options.ConfigurationExtensions analog; docs/decisions.md §4.1).
//
// Installs fluent authoring methods onto di.core's registration builder via the
// augmentation pattern (TS declaration merging + a runtime prototype assignment
// through the OPEN-set registry), exactly how @rhombus-std/config.json adds
// `addJsonFile` to ConfigurationBuilder:
//
//   - `addOptions<T>(token, makeBase)` -- registers the `Options<T>` assembly
//     (the OptionsFactory pipeline, §4.5) for `token`. Returns the `.as(scope)`
//     continuation so the consumer picks the registration lifetime (§4.2: with
//     open-ended scopes, Options is registered explicitly at a chosen scope).
//   - `configure(token, section)` -- registers a config-bind configure step
//     PLUS a change-token source wired to the section's reload token, so the
//     delivered `Options<T>` binds the section and reacts to reloads (#6).
//     Mirrors ME's Configure<TOptions>(IConfiguration) =
//     NamedConfigureFromConfigurationOptions + ConfigurationChangeTokenSource.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/options.augmentations";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.
//
// di and config stay mutually unaware -- the bridge code lives ONLY here (§4.3).

import type { IConfiguration } from '@rhombus-std/config.core';
// `AddBuilder` and `Token` are named imports (not member references inside the
// augmentation block) because unqualified names in a `declare module` body
// resolve in THIS file's scope.
import { type AddBuilder, RESOLVER_TOKEN, type ServiceManifest, ServiceManifestClass,
  type Token } from '@rhombus-std/di.core';
import { type ConfigureOptions, Options, type PostConfigureOptions, type ValidateOptions,
  ValidateOptionsResult } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { assembleOptions } from './assemble-options.js';
import { ConfigurationChangeTokenSource } from './ConfigurationChangeTokenSource.js';
import { ConfigurationConfigureOptions } from './ConfigurationConfigureOptions.js';
import { changeTokenSourceToken, configureStepToken, postConfigureStepToken,
  validateStepToken } from './option-tokens.js';

// The reference OptionsBuilder's `DefaultValidationFailureMessage`, used when a
// `validate` caller supplies no message.
const DEFAULT_VALIDATION_FAILURE_MESSAGE = 'A validation error has occurred.';

// A same-length tuple of dependency-token strings, one per entry in `Deps` -- the
// token list a DI-injected pipeline step (the `configure`/`postConfigure`/
// `validate` dependency forms below) resolves from the provider before invoking
// its callback. A typed caller writes `[nameof<Dep1>(), nameof<Dep2>()]`.
type DepTokens<Deps extends readonly unknown[]> = { [K in keyof Deps]: Token; };

// The authored methods merge onto core's `ServiceManifestBase` interface -- the
// surface the public `ServiceManifest` (`= ServiceManifestBase<…>`) a consumer
// holds resolves to -- AND onto the concrete `ServiceManifestClass`, so the
// class still SATISFIES `implements ServiceManifestBase` once these NEW method
// names are on the interface. (di.transformer only merges OVERLOADS of existing
// methods, so it needs no class-side merge; a brand-new name does.) `Provider`
// is defaulted so each merge matches its target's type-parameter list (TS2428
// requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface ServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Registers an `Options<T>` at `token` that WRAPS the `T` resolved from
     * `tToken`. The explicit, complete, transformer-free verb (#34): internally
     * just `addFactory(token, (t) => Options.of(t), [[tToken]])`, so di gains no
     * new primitive. The type-driven `addOptions<T>()` sugar
     * (`@rhombus-std/di.transformer.options`) lowers to exactly this call,
     * deriving `token` = `token(Options<T>)` and `tToken` = `token(T)`.
     *
     * Distinct from the pipeline overload below by its second argument's type: a
     * `Token` (string) here, a `() => T` base factory there. Returns the
     * `.as(scope)` continuation so the lifetime is chosen at the registration
     * site.
     */
    addOptions(token: Token, tToken: Token): AddBuilder<Scopes>;
    /**
     * Registers the `Options<T>` assembly for `token`: resolving `token`
     * assembles the value from all configure/post-configure/validate steps and
     * change-token sources registered for it (the OptionsFactory pipeline).
     * `makeBase` produces the base instance each pipeline run starts from.
     * Returns the `.as(scope)` continuation so the lifetime is chosen at the
     * registration site.
     */
    addOptions<T>(token: Token, makeBase: Func<[], T>): AddBuilder<Scopes>;
    /**
     * Registers a configuration `section` to bind against the options
     * identified by `token`: adds a config-bind configure step and a
     * change-token source wired to the section's reload token. Requires a prior
     * {@link addOptions} for the same `token`.
     */
    configure(token: Token, section: IConfiguration): this;
    /**
     * Registers a code configure step for `token`: `configureOptions` runs
     * against the value as one configure source among several (no config
     * section, so no change-token source). The delegate overload of
     * {@link configure}, distinguished from the config-section overload by its
     * function argument. ME puts this in `OptionsServiceCollectionExtensions`,
     * but the registry's flat bag namespace forbids a second `configure` member
     * on the token, so the config-section member absorbs it by arg type (§38).
     */
    configure<T>(token: Token, configureOptions: Func<[T], void>): this;
    /**
     * The DI-injected configure step: resolves each token in `depTokens` from the
     * provider at materialization time and passes the instances to
     * `configureOptions` after the options value. ME's
     * `OptionsBuilder.Configure<TDep1..5>` family collapsed onto ONE variadic form
     * (§42): a token tuple plus a tuple-typed callback instead of five fixed
     * arities. A typed caller writes each token as `nameof<Dep>()`.
     */
    configure<T, Deps extends readonly unknown[]>(
      token: Token,
      depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void,
    ): this;
    /**
     * Registers a post-configure step for `token`, run after every configure
     * step. Accepts a {@link PostConfigureOptions} or a bare `(options) => void`
     * delegate. Mirrors ME's `OptionsServiceCollectionExtensions.PostConfigure`.
     */
    postConfigure<T>(token: Token, step: PostConfigureOptions<T> | Func<[T], void>): this;
    /**
     * The DI-injected post-configure step: resolves each token in `depTokens` and
     * passes the instances to `configureOptions` after the options value. ME's
     * `OptionsBuilder.PostConfigure<TDep1..5>` family, collapsed the same way as
     * the {@link configure} dependency form above (§42).
     */
    postConfigure<T, Deps extends readonly unknown[]>(
      token: Token,
      depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void,
    ): this;
    /**
     * Registers a validate step for `token`: `validate` runs against the
     * fully-configured value; a `false` result fails validation with
     * `failureMessage`. ME analog is the instance-method `OptionsBuilder.Validate`
     * (unported, §4.2) -- the verb collapses onto the manifest here.
     */
    validate<T>(token: Token, validate: Func<[T], boolean>, failureMessage?: string): this;
    /**
     * The DI-injected validate step: resolves each token in `depTokens` and passes
     * the instances to `validate` after the options value; a `false` result fails
     * with `failureMessage`. ME's `OptionsBuilder.Validate<TDep1..5>` family,
     * collapsed the same way as the {@link configure} dependency form above (§42).
     */
    validate<T, Deps extends readonly unknown[]>(
      token: Token,
      depTokens: DepTokens<Deps>,
      validate: (options: T, ...deps: Deps) => boolean,
      failureMessage?: string,
    ): this;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    addOptions(token: Token, tToken: Token): AddBuilder<Scopes>;
    addOptions<T>(token: Token, makeBase: Func<[], T>): AddBuilder<Scopes>;
    configure(token: Token, section: IConfiguration): this;
    configure<T>(token: Token, configureOptions: Func<[T], void>): this;
    configure<T, Deps extends readonly unknown[]>(
      token: Token,
      depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void,
    ): this;
    postConfigure<T>(token: Token, step: PostConfigureOptions<T> | Func<[T], void>): this;
    postConfigure<T, Deps extends readonly unknown[]>(
      token: Token,
      depTokens: DepTokens<Deps>,
      configureOptions: (options: T, ...deps: Deps) => void,
    ): this;
    validate<T>(token: Token, validate: Func<[T], boolean>, failureMessage?: string): this;
    validate<T, Deps extends readonly unknown[]>(
      token: Token,
      depTokens: DepTokens<Deps>,
      validate: (options: T, ...deps: Deps) => boolean,
      failureMessage?: string,
    ): this;
  }
}

// One named object literal per ME static class (docs §28/§38): `addOptions`,
// `postConfigure`, `validate` mirror `OptionsServiceCollectionExtensions`;
// `configure` mirrors `OptionsConfigurationServiceCollectionExtensions` -- two
// ME classes over the same receiver, so two literals. Each is registered into
// the OPEN-set augmentation registry (below) so the decorated
// `ServiceManifestClass` mounts its members as prototype methods (the primary
// path); the const is also exported so the member is the standalone form. The
// overloads/generics live on the declare-module merge above (the method
// signature's source of truth); the member impls carry the disambiguating unions.
export const OptionsServiceCollectionExtensions = {
  addOptions<T>(
    manifest: ServiceManifestClass<string>,
    token: Token,
    source: Token | Func<[], T>,
  ): AddBuilder<string> {
    // Two verbs share the name, disambiguated by the second argument (§15):
    //   - a `Token` (string)      → wrap the already-bound `T` resolved from it
    //     (#34): `addFactory(token, (t) => Options.of(t), [[tToken]])`.
    //   - a `() => T` base factory → run the OptionsFactory assembly pipeline
    //     (#40) over the steps/sources registered for `token`.
    if (typeof source === 'function') {
      return manifest.addFactory(
        token,
        (resolver) => assembleOptions(resolver, token, source),
        [[RESOLVER_TOKEN]],
      );
    }
    return manifest.addFactory(token, (t: T) => Options.of(t), [[source]]);
  },
  postConfigure<T, Deps extends readonly unknown[]>(
    manifest: ServiceManifestClass<string>,
    token: Token,
    step: PostConfigureOptions<T> | Func<[T], void> | DepTokens<Deps>,
    configureWithDeps?: (options: T, ...deps: Deps) => void,
  ): ServiceManifestClass<string> {
    // DI-injected form (§42): `step` is the dep-token tuple and
    // `configureWithDeps` the callback. Register a FACTORY for the post-configure
    // slot whose injected params ARE the resolved deps; it produces a
    // PostConfigureOptions that forwards them after the options value. The deps
    // resolve once, when the assembly reads the slot -- consistent with how every
    // pipeline step is captured once (a divergence from ME's per-materialization
    // transient resolve, harmless for the stable services deps carry).
    if (Array.isArray(step)) {
      const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
      manifest.addFactory(
        postConfigureStepToken(token),
        (...deps: Deps): PostConfigureOptions<T> => ({
          postConfigure(options: T): void {
            callback(options, ...deps);
          },
        }),
        [step as readonly Token[]],
      );
      return manifest;
    }
    // A bare delegate is wrapped into a PostConfigureOptions<T>; both append to
    // the token's post-configure slot, which `assembleOptions` reads and runs
    // after every configure step (previously a dead slot -- now reachable).
    const plain = step as PostConfigureOptions<T> | Func<[T], void>;
    const wrapped: PostConfigureOptions<T> = typeof plain === 'function'
      ? { postConfigure: plain }
      : plain;
    manifest.addValue(postConfigureStepToken(token), wrapped);
    return manifest;
  },
  validate<T, Deps extends readonly unknown[]>(
    manifest: ServiceManifestClass<string>,
    token: Token,
    validateOrDeps: Func<[T], boolean> | DepTokens<Deps>,
    failureMessageOrValidate?: string | ((options: T, ...deps: Deps) => boolean),
    failureMessage?: string,
  ): ServiceManifestClass<string> {
    // DI-injected form (§42): `validateOrDeps` is the dep-token tuple,
    // `failureMessageOrValidate` the predicate, `failureMessage` its message.
    // Register a FACTORY whose injected params ARE the resolved deps, producing a
    // ValidateOptions that forwards them after the options value.
    if (Array.isArray(validateOrDeps)) {
      const predicate = failureMessageOrValidate as (options: T, ...deps: Deps) => boolean;
      const message = failureMessage ?? DEFAULT_VALIDATION_FAILURE_MESSAGE;
      manifest.addFactory(
        validateStepToken(token),
        (...deps: Deps): ValidateOptions<T> => ({
          validate(options: T): ValidateOptionsResult {
            return predicate(options, ...deps)
              ? ValidateOptionsResult.success
              : ValidateOptionsResult.fail(message);
          },
        }),
        [validateOrDeps as readonly Token[]],
      );
      return manifest;
    }
    // Wrap the predicate into a ValidateOptions<T> step appended to the token's
    // validate slot (also previously dead). ME's analog is the instance-method
    // OptionsBuilder.Validate; OptionsBuilder is unported (§4.2), so the verb
    // collapses onto the manifest -- flagged as a deliberate deviation.
    const validateFn = validateOrDeps as Func<[T], boolean>;
    const message = (failureMessageOrValidate as string | undefined) ?? DEFAULT_VALIDATION_FAILURE_MESSAGE;
    const step: ValidateOptions<T> = {
      validate(options: T): ValidateOptionsResult {
        return validateFn(options)
          ? ValidateOptionsResult.success
          : ValidateOptionsResult.fail(message);
      },
    };
    manifest.addValue(validateStepToken(token), step);
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

export const OptionsConfigurationServiceCollectionExtensions = {
  configure<T, Deps extends readonly unknown[]>(
    manifest: ServiceManifestClass<string>,
    token: Token,
    source: IConfiguration | Func<[T], void> | DepTokens<Deps>,
    configureWithDeps?: (options: T, ...deps: Deps) => void,
  ): ServiceManifestClass<string> {
    // DI-injected form (§42): `source` is the dep-token tuple and
    // `configureWithDeps` the callback. Register a FACTORY for the configure slot
    // whose injected params ARE the resolved deps; it produces a ConfigureOptions
    // that forwards them after the options value. The deps resolve once, when the
    // assembly reads the slot -- consistent with how every step is captured once.
    if (Array.isArray(source)) {
      const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
      manifest.addFactory(
        configureStepToken(token),
        (...deps: Deps): ConfigureOptions<T> => ({
          configure(options: T): void {
            callback(options, ...deps);
          },
        }),
        [source as readonly Token[]],
      );
      return manifest;
    }
    // A bare delegate is a pure code configure step: register only the configure
    // slot, no change-token source. ME houses delegate-Configure in
    // OptionsServiceCollectionExtensions, but the registry's flat bag namespace
    // (rule §38) forbids a second `configure` member on the token, so the
    // config-section member absorbs the delegate by arg type -- the same
    // disambiguation precedent `addOptions` uses.
    const configSource = source as IConfiguration | Func<[T], void>;
    if (typeof configSource === 'function') {
      manifest.addValue(configureStepToken(token), { configure: configSource });
      return manifest;
    }
    manifest.addValue(configureStepToken(token), new ConfigurationConfigureOptions(configSource));
    manifest.addValue(changeTokenSourceToken(token), new ConfigurationChangeTokenSource(configSource));
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

// OPEN set: both consts target ServiceManifest, extended by many downstream
// packages, so they register into the primitives augmentation registry beside
// this declare-module merge. The `ServiceManifestClass` decorated with the same
// token (di.core) pulls these members onto its prototype (§38).
registerAugmentations(nameof<ServiceManifest>(), OptionsServiceCollectionExtensions);
registerAugmentations(nameof<ServiceManifest>(), OptionsConfigurationServiceCollectionExtensions);

// `validateOnStart` lives in its own file named after its reference static class
// (`OptionsBuilderExtensions`, §28) with `Extensions` -> `augmentations`, matching
// the di.core `service-collection-descriptor-augmentations.ts` precedent. The
// re-export executes that module, so its `registerAugmentations` side effect
// installs the verb onto the manifest.
export { OptionsBuilderExtensions } from './options-builder-augmentations.js';

export { ConfigurationChangeTokenSource } from './ConfigurationChangeTokenSource.js';
export { ConfigurationConfigureOptions } from './ConfigurationConfigureOptions.js';
// The slot-token grammar is public surface: in the reference stack the
// per-options configure / post-configure / validate steps and change-token
// sources are ordinary OPEN service contracts — any downstream package may
// register an implementation for a TOptions it doesn't own (the logging
// configuration package registers both a custom configure step and a
// change-token source that way). Here the derived slot token IS that
// contract, so the derivation functions are exported: a downstream package
// appends a step with `services.addValue(configureStepToken(token), step)`
// (or `add`/`addFactory` for a lazily-constructed step) and the assembly for
// `token` picks it up like any `configure(...)`-registered one.
export { changeTokenSourceToken, configureStepToken, postConfigureStepToken, startupValidationTargetToken,
  validateStepToken } from './option-tokens.js';
export type { OptionsChangeTokenSource } from './OptionsChangeTokenSource.js';

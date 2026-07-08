// Public entry point for @rhombus-std/options.augmentations -- the config -> Options
// bridge (MEO's Options.ConfigurationExtensions analog; docs/decisions.md §4.1).
//
// Installs two fluent authoring methods onto di.core's registration builder via
// the extension-method-mimicking augmentation pattern (TS declaration merging +
// a runtime prototype assignment), exactly how @rhombus-std/config.json adds
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

import type { IConfiguration } from "@rhombus-std/config.core";
// `AddBuilder` and `Token` are named imports (not member references inside the
// augmentation block) because unqualified names in a `declare module` body
// resolve in THIS file's scope.
import type { AddBuilder, Token } from "@rhombus-std/di.core";
import { RESOLVER_TOKEN, ServiceManifestClass } from "@rhombus-std/di.core";
import { Options } from "@rhombus-std/options";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";

import { assembleOptions } from "./assemble-options.js";
import { ConfigurationChangeTokenSource } from "./configuration-change-token-source.js";
import { ConfigurationConfigureOptions } from "./configuration-configure-options.js";
import { changeTokenSourceToken, configureStepToken } from "./option-tokens.js";

// The authored methods merge onto core's `ServiceManifestBase` interface -- the
// surface the public `ServiceManifest` (`= ServiceManifestBase<…>`) a consumer
// holds resolves to -- AND onto the concrete `ServiceManifestClass`, so the
// class still SATISFIES `implements ServiceManifestBase` once these NEW method
// names are on the interface. (di.transformer only merges OVERLOADS of existing
// methods, so it needs no class-side merge; a brand-new name does.) `Provider`
// is defaulted so each merge matches its target's type-parameter list (TS2428
// requires identical parameters).
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
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
    addOptions<T>(token: Token, makeBase: () => T): AddBuilder<Scopes>;
    /**
     * Registers a configuration `section` to bind against the options
     * identified by `token`: adds a config-bind configure step and a
     * change-token source wired to the section's reload token. Requires a prior
     * {@link addOptions} for the same `token`.
     */
    configure(token: Token, section: IConfiguration): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    addOptions(token: Token, tToken: Token): AddBuilder<Scopes>;
    addOptions<T>(token: Token, makeBase: () => T): AddBuilder<Scopes>;
    configure(token: Token, section: IConfiguration): this;
  }
}

// One named object literal per ME static class (docs §28): `addOptions` mirrors
// `OptionsServiceCollectionExtensions`, `configure` mirrors
// `OptionsConfigurationServiceCollectionExtensions` -- two ME classes over the
// same receiver, so two literals. Installed as prototype methods (the primary
// path) via applyAugmentations AND exported so the member is the standalone
// form. The overloads/generics live on the declare-module merge above (the
// method signature's source of truth); the member impl carries the
// disambiguating union.
export const OptionsServiceCollectionExtensions = {
  addOptions<T>(
    manifest: ServiceManifestClass<string>,
    token: Token,
    source: Token | (() => T),
  ): AddBuilder<string> {
    // Two verbs share the name, disambiguated by the second argument (§15):
    //   - a `Token` (string)      → wrap the already-bound `T` resolved from it
    //     (#34): `addFactory(token, (t) => Options.of(t), [[tToken]])`.
    //   - a `() => T` base factory → run the OptionsFactory assembly pipeline
    //     (#40) over the steps/sources registered for `token`.
    if (typeof source === "function") {
      return manifest.addFactory(
        token,
        (resolver) => assembleOptions(resolver, token, source),
        [[RESOLVER_TOKEN]],
      );
    }
    return manifest.addFactory(token, (t: T) => Options.of(t), [[source]]);
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

export const OptionsConfigurationServiceCollectionExtensions = {
  configure(
    manifest: ServiceManifestClass<string>,
    token: Token,
    section: IConfiguration,
  ): ServiceManifestClass<string> {
    manifest.addValue(configureStepToken(token), new ConfigurationConfigureOptions(section));
    manifest.addValue(changeTokenSourceToken(token), new ConfigurationChangeTokenSource(section));
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

applyAugmentations(ServiceManifestClass, OptionsServiceCollectionExtensions);
applyAugmentations(ServiceManifestClass, OptionsConfigurationServiceCollectionExtensions);

export { ConfigurationChangeTokenSource } from "./configuration-change-token-source.js";
export { ConfigurationConfigureOptions } from "./configuration-configure-options.js";
export type { OptionsChangeTokenSource } from "./options-change-token-source.js";

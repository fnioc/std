// The config -> Options bridge: installs fluent authoring methods onto di.core's
// registration builder via the augmentation pattern (TS declaration merging + a
// runtime prototype assignment through the OPEN-set registry), the same
// mechanism @rhombus-std/config.json uses to add `addJsonFile` to ConfigBuilder:
//
//   - `addOptions<T>(token, makeBase)` -- registers the `IOptions<T>` assembly
//     (the OptionsFactory pipeline) for `token`. Returns the `.as(scope)`
//     continuation so the consumer picks the registration lifetime.
//   - `configure(token, section)` -- registers a config-bind configure step
//     PLUS a change-token source wired to the section's reload token, so the
//     delivered `IOptions<T>` binds the section and reacts to reloads.
//   - `validateOnStart(token)` -- forces the pipeline to run at host startup.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/options.augmentations";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.
//
// di and config stay mutually unaware -- the bridge code lives ONLY here.

export { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
export { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
export type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';
// The slot-token grammar is public surface: the per-options configure /
// post-configure / validate steps and change-token sources are ordinary OPEN
// service contracts — any downstream package may register an implementation
// for a TOptions it doesn't own (logging.config registers both a custom
// configure step and a change-token source that way). The derived slot token
// IS that contract, so the derivation functions are exported: a downstream
// package appends a step with `services.addValue(configureStepToken(token),
// step)` (or `add`/`addFactory` for a lazily-constructed step), and the
// assembly for `token` picks it up like any `configure(...)`-registered one.
export { changeTokenSourceToken, configureStepToken, postConfigureStepToken, startupValidationTargetToken,
  validateStepToken } from './option-tokens.js';

// Each re-export executes its module, so the `registerAugmentations` side effect
// installs the verbs onto the manifest.
export { ServiceManifestOptionsAugmentations } from './DefaultManifest-Options-augmentations.js';
export { ServiceManifestOptionsConfigAugmentations } from './DefaultManifest-OptionsConfig-augmentations.js';
export { ServiceManifestValidateOnStartAugmentations } from './DefaultManifest-ValidateOnStart-augmentations.js';

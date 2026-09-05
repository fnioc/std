// The config -> Options bridge. `addOptions` installs a fluent verb onto
// di.core's registration builder via the augmentation pattern (TS declaration
// merging + a runtime prototype assignment through the OPEN-set registry),
// the same mechanism @rhombus-std/config.json uses to add `addJsonFile` to
// ConfigBuilder. `getConfigureManifest`, `getPostConfigureManifest`,
// `getValidateManifest`, and `getValidateOnStartManifest` are ordinary
// functions, each returning a self-contained manifest for the caller to
// merge in with `add`:
//
//   - `addOptions(T[, makeBase])` -- offers `IOptions<T>` for the options type
//     `T`, either over a base factory or over whatever `T` itself resolves to.
//   - `getConfigureManifest(T, section)` -- a manifest registering a
//     config-bind configure step PLUS a change-token source wired to the
//     section's reload token, so the delivered `IOptions<T>` binds the
//     section and reacts to reloads.
//   - `getValidateOnStartManifest(T)` -- a manifest that forces the pipeline
//     to run at host startup.
//
// Every verb names the BARE `T`. `IOptions<T>` is registered once, open, and
// answers every closed request; the type that closed it arrives through a
// bare-hole signature slot, from which the assembly finds that type's steps.
//
// A consumer who only wants `addOptions`'s verb takes a bare side-effect
// import: `import "@rhombus-std/options.augmentations";`. This package MUST
// keep `"sideEffects": true` so a bundler cannot tree-shake the augmentation
// away.
//
// di and config stay mutually unaware -- the bridge code lives ONLY here.

export * from './ConfigChangeTokenSource.js';
export * from './ConfigConfigureOptions.js';
export type * from './IOptionsChangeTokenSource.js';
// The slot-type grammar is public surface: the per-options configure /
// post-configure / validate steps and change-token sources are ordinary OPEN
// service contracts — any downstream package may register an implementation
// for a TOptions it doesn't own (logging.config registers both a custom
// configure step and a change-token source that way). The derived slot type
// IS that contract, so the derivation functions are exported: a downstream
// package appends a step with `services.addValue(configureStepType(optionsType),
// step)` (or the class/factory forms for a lazily-constructed
// step), and the assembly for `optionsType` picks it up like any
// `configure(...)`-registered one.
export { baseFactoryType, changeTokenSourceType, configureStepType, optionsAddressType, postConfigureStepType, validateStepType } from './option-types.js';

// Re-exporting Manifest-Options-augmentations.js executes its module, so the
// `registerAugmentations` side effect installs `addOptions` onto the
// manifest; the other two modules contribute their manifest-returning
// functions the same way any other export does.
export * from './configure-manifests.js';
export * from './Manifest-Options-augmentations.js';
export * from './validate-on-start-manifests.js';

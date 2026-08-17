// The config -> Options bridge: installs fluent authoring methods onto di.core's
// registration builder via the augmentation pattern (TS declaration merging + a
// runtime prototype assignment through the OPEN-set registry), the same
// mechanism @rhombus-std/config.json uses to add `addJsonFile` to ConfigBuilder:
//
//   - `addOptions(T[, makeBase])` -- offers `IOptions<T>` for the options type
//     `T`, either over a base factory or over whatever `T` itself resolves to.
//   - `configure(T, section)` -- registers a config-bind configure step
//     PLUS a change-token source wired to the section's reload token, so the
//     delivered `IOptions<T>` binds the section and reacts to reloads.
//   - `validateOnStart(T)` -- forces the pipeline to run at host startup.
//
// Every verb names the BARE `T`. `IOptions<T>` is registered once, open, and
// answers every closed request; the type that closed it arrives through a
// bare-hole signature slot, from which the assembly finds that type's steps.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/options.augmentations";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.
//
// di and config stay mutually unaware -- the bridge code lives ONLY here.

export * from './ConfigChangeTokenSource.js';
export * from './ConfigConfigureOptions.js';
export type * from './IOptionsChangeTokenSource.js';
// The slot-token grammar is public surface: the per-options configure /
// post-configure / validate steps and change-token sources are ordinary OPEN
// service contracts — any downstream package may register an implementation
// for a TOptions it doesn't own (logging.config registers both a custom
// configure step and a change-token source that way). The derived slot token
// IS that contract, so the derivation functions are exported: a downstream
// package appends a step with `services.add(configureStepType(token),
// step)` (or `add`/`addFactory` for a lazily-constructed step), and the
// assembly for `token` picks it up like any `configure(...)`-registered one.
export { baseFactoryType, changeTokenSourceType, configureStepType, optionsAddressType, postConfigureStepType, startupValidationTargetType, validateStepType } from './option-types.js';

// Each re-export executes its module, so the `registerAugmentations` side effect
// installs the verbs onto the manifest.
export * from './DefaultManifest-Options-augmentations.js';
export * from './DefaultManifest-OptionsConfig-augmentations.js';
export * from './DefaultManifest-ValidateOnStart-augmentations.js';

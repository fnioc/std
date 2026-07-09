// @rhombus-std/unplugin — the unplugin host for the @rhombus-std ts-patch
// transformers.
//
// ONE bundler-agnostic plugin (via unplugin) composes every @rhombus-std
// transformer over a shared, LanguageService-backed `ts.Program`, so a Vite /
// Rollup / esbuild / webpack / Bun build gets the same type-driven authoring
// forms (`add<I>(C)`, `addOptions<T>()`, `.withType<T>()`, `nameof<T>()`) that
// `tspc` lowers today — with no ts-patch and no per-package plugin wiring.
//
// The default export IS the unplugin instance; reach any adapter off it
// (`unplugin.vite`, `unplugin.bun`, …). The ProgramService and the transform
// registry are white-box seams exposed through `./internal/*`, not the public
// surface.

export { unplugin, type UnpluginStdOptions } from "./plugin.js";
export { type TransformName } from "./registry.js";

export { unplugin as default } from "./plugin.js";

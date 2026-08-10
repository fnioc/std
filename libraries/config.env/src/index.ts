// Public entry point for @rhombus-std/config.env: the environment-variable
// source/provider pair, plus the builder sugar that registers it.
//
// A consumer who only wants the sugar (never naming a runtime symbol from this
// package) needs a bare side-effect import: `import "@rhombus-std/config.env";`.

export { ConfigBuilderEnvAugmentations } from './ConfigBuilder-Env-augmentations';
export { EnvironmentVariablesConfigProvider } from './EnvironmentVariablesConfigProvider';
export { colonAndDotVariableNameTransformation, defaultVariableNameTransformation,
  EnvironmentVariablesConfigSource } from './EnvironmentVariablesConfigSource';
export type { EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';

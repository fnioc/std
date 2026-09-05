// Public entry point for @rhombus-std/config.commandline: the command-line
// source/provider pair, plus the builder sugar that registers it.
//
// A consumer who only wants the sugar (never naming a runtime symbol from this
// package) needs a bare side-effect import:
// `import "@rhombus-std/config.commandline";`.
//
// `@rhombus-std/config` and `@rhombus-std/primitives` MUST stay external in this
// package's bundle. An inlined copy would decorate a private duplicate of the
// builder classes and fork the registry's Map, so the sugar would never reach
// the classes the consumer's own imports resolve to.

export * from './CommandLineConfigProvider';
export * from './CommandLineConfigSource';
export * from './ConfigBuilder-CommandLine-augmentations';

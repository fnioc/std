// Public entry point for @rhombus-std/config.ini: the INI file and stream
// source/provider pairs, plus the builder sugar that registers them.
//
// A consumer who only wants the sugar needs a bare side-effect import:
// `import "@rhombus-std/config.ini";`. `sideEffects: true` in package.json
// keeps a bundler from tree-shaking the registration away.

export * from './ConfigBuilder-Ini-augmentations';
export * from './IniConfigProvider';
export * from './IniConfigSource';
export * from './IniStreamConfigProvider';
export * from './IniStreamConfigSource';

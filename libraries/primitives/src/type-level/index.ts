// Compile-time machinery: types that compute over other types, plus the global
// `ObjectConstructor` augmentation that gives `Object.keys`/`values`/`entries`
// their precise results. Nothing here emits a runtime value.
//
// Distinct from `../Type`, which is the runtime node system for naming a type as
// a value.

export * from './counters';
export * from './Flatten';
export * from './ObjectConstructor-augmentations';
export * from './union-vs-tuple';

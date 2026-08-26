// The way into Plan/: the node union and its namespace. The visitors beside it build one or
// realize one, and are reached only through `Plan.from` and `Plan.realize`.
//
// Only what a consumer actually names is re-exported. The kind interfaces and `RealizeOptions` stay
// on `Plan.ts` for the walks that switch over them; this directory is under `internal/`, so
// there is no published surface for them to be part of.

export { Plan } from './Plan.js';

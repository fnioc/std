// The way into Plan/: the node union and its namespace. The visitors beside it build one or
// realize one, and are reached only through `Plan.from` and `Plan.realize`.
//
// Only what a consumer actually names is re-exported. The kind interfaces stay on `Plan.ts` for
// the visitors that switch over them; this directory is under `internal/`, so there is no
// published surface for them to be part of.

export { Plan } from './Plan.js';
export type { VisitorContext } from './RealizeVisitor.js';

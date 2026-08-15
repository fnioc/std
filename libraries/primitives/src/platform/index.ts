// Structural typings for the host platform, each a typed `globalThis` lookup
// rather than an ambient declaration. Reaching the platform through these is
// what lets every library compile with `types: []` — no lib.dom, no
// `@types/node`, no bun-types anywhere in the graph.

export * from './abort';
export * from './process';
export type * from './ReadableStream';
export * from './TimeoutHandle';

// Minimal compile-scope typing for `node:async_hooks` — this package carries
// no @types/node. It doesn't import async_hooks directly, but co-compiles
// with @rhombus-std/logging's `LoggerExternalScopeProvider`, which does.
// Nothing imports this file, so it's never bundled or shipped; if a consumer
// program already has @types/node, this merges in as an inert extra overload.

declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    enterWith(store: T): void;
  }
}

// Minimal compile-scope typing for `node:async_hooks` — libraries carry no
// @types/node. This package does not import it directly; it enters the program
// through @rhombus-std/logging's `LoggerExternalScopeProvider`, which imports
// `AsyncLocalStorage`. Compile-scope only: nothing imports this file, so
// rollup-plugin-dts never reaches it and the declaration is NOT shipped. When
// @types/node happens to be in a consumer program, the declaration merges as an
// extra overload — legal and inert.

declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    enterWith(store: T): void;
  }
}

// Minimal compile-scope typings for the real node builtin imports in this
// package's program -- libraries carry no @types/node (docs/decisions.md
// §39/§44), so the modules are declared here with exactly the signatures the
// call sites use. `LoggerExternalScopeProvider` needs `AsyncLocalStorage` from
// node:async_hooks for the ambient scope stack. Compile-scope only: nothing
// imports this file, so rollup-plugin-dts never reaches it and the declarations
// are NOT shipped. When @types/node happens to be in a consumer program the
// declarations merge as extra overloads -- legal and inert.

declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    enterWith(store: T): void;
  }
}

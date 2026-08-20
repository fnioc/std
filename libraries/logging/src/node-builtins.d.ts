// Minimal compile-scope typings for the node builtins this package's program
// imports — this package carries no @types/node, so each module is declared
// here with exactly the signatures the call sites use.
// `LoggerExternalScopeProvider` needs `AsyncLocalStorage` from
// node:async_hooks for the ambient scope stack. Each importing file pulls
// this in by triple-slash reference, so the typings travel into any program
// that compiles this source; it is never bundled or shipped. When @types/node
// happens to be in a consumer program, these declarations merge as extra
// overloads — legal and inert.

declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    enterWith(store: T): void;
  }
}

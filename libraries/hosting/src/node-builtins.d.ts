// Minimal compile-scope typings for the node builtins that enter this package's
// program -- libraries carry no @types/node, so each module is declared with
// exactly the signatures its call sites use. Nothing in hosting imports them
// directly; they arrive transitively, `node:fs`/`node:path` through
// config.json's `JsonConfigProvider` and `node:async_hooks` through logging's
// `LoggerExternalScopeProvider`. Compile-scope only: nothing imports this file,
// so rollup-plugin-dts never reaches it and the declarations are NOT shipped.
// When @types/node happens to be in a consumer program the declarations merge
// as extra overloads -- legal and inert.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string;
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
}
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    enterWith(store: T): void;
  }
}

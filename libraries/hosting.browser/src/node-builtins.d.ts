// Minimal compile-scope typings for the node builtins pulled in transitively
// through this package's program (via @rhombus-std/hosting and logging's
// LoggerExternalScopeProvider) -- libraries carry no @types/node. Nothing in
// hosting.browser imports these directly, so rollup-plugin-dts never reaches
// this file and the declarations are NOT shipped. If @types/node is present in
// a consumer program, these merge in as extra overloads -- legal and inert.

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

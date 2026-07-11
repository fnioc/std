// Minimal compile-scope typings for the real node builtin imports in this
// package's program -- libraries carry no @types/node (docs/decisions.md
// §39/§44). Nothing in hosting.browser imports any of these; they come in
// because this package src-references @rhombus-std/hosting, whose program
// still co-compiles config.json's `JsonConfigurationProvider` (`node:fs` +
// `node:path`, see #68) and logging's `LoggerExternalScopeProvider`
// (`node:async_hooks`). Compile-scope only: nothing imports this file, so
// rollup-plugin-dts never reaches it and the declarations are NOT shipped.
// When @types/node happens to be in a consumer program the declarations merge
// as extra overloads -- legal and inert.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
}
declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
}
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    enterWith(store: T): void;
  }
}

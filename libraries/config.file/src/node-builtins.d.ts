// Minimal compile-scope typings for the node builtins this package imports --
// libraries carry no @types/node (docs/decisions.md §39/§44), so the two
// modules used here are declared with exactly the signatures the call sites
// need. Compile-scope only: nothing imports this file, so rollup-plugin-dts
// never reaches it and the declarations are not shipped.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string;
}
declare module 'node:path' {
  export function isAbsolute(path: string): boolean;
  export function dirname(path: string): string;
  export function basename(path: string): string;
}

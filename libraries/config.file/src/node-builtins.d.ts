// Minimal compile-scope typings for the node builtins this package imports --
// libraries carry no @types/node, so the two modules used here are declared
// with exactly the signatures the call sites need. Each importing file pulls
// this in by triple-slash reference, so the typings travel into any program
// that compiles this source; the rolled public declarations don't carry them.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string;
}
declare module 'node:path' {
  export function isAbsolute(path: string): boolean;
  export function dirname(path: string): string;
  export function basename(path: string): string;
}

// Minimal compile-scope typings for the real node builtin imports below --
// libraries carry no @types/node (docs/decisions.md §39), so the two modules
// this package genuinely imports are declared here with exactly the
// signatures the call sites use. Compile-scope only: nothing imports this
// file, so rollup-plugin-dts never reaches it and the declarations are NOT
// shipped. When @types/node happens to be in a consumer program the
// declarations merge as extra overloads -- legal and inert.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
}
declare module "node:path" {
  export function resolve(...paths: string[]): string;
}

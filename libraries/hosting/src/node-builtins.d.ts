// Minimal compile-scope typings for the real node builtin imports in this
// package's program -- libraries carry no @types/node (docs/decisions.md
// §39/§44), so the modules are declared here with exactly the signatures the
// call sites use. `node:fs` is not imported by hosting itself, but hosting is
// still src-referenced onto config.json (see #68), whose source co-compiles
// in this program and imports it. Compile-scope only: nothing imports this
// file, so rollup-plugin-dts never reaches it and the declarations are NOT
// shipped. When @types/node happens to be in a consumer program the
// declarations merge as extra overloads -- legal and inert.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
}
declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
}

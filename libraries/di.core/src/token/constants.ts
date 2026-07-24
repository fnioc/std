// Leaf constants + the local exhaustiveness guard for the token module. Kept in
// its own dependency-free file so every other token file (`parse`, `stringify`,
// the visitors) can import the resolver sentinel and `assertNever` without
// pulling the `TokenNode` companion value — which would form an import cycle
// through the files the companion delegates to.

/** The canonical string of the resolver intrinsic — di.core's provider token. */
export const RESOLVER_TOKEN_STRING = '@rhombus-std/di.core:IResolver';

/** Local self-contained exhaustiveness guard (avoids a cross-package import). */
export function assertNever(value: never): never {
  throw new Error(`unreachable token kind: ${JSON.stringify(value)}`);
}

// Kept dependency-free so every other token file can import these without
// pulling the `TokenNode` companion value — which would cycle back through the
// files that companion delegates to.

/** The canonical string of the resolver intrinsic — di.core's provider token. */
export const RESOLVER_TOKEN_STRING = '@rhombus-std/di.core:IResolver';

/** Local self-contained exhaustiveness guard (avoids a cross-package import). */
export function assertNever(value: never): never {
  throw new Error(`unreachable token kind: ${JSON.stringify(value)}`);
}

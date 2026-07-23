// The intrinsic provider tokens — the runtime seam that makes "I want the
// provider" plain DI. A factory (or ctor) that declares a `IResolver`-typed
// parameter derives the ordinary token below (the transformer emits it like any
// other param — no dedicated slot kind); the resolution engine recognizes it and
// hands back the nearest open scope's provider VIEW instead of looking up a
// registration. This subsumes the retired `ScopeRef` slot marker.
//
// The token is the one the transformer derives for the non-generic `IResolver`
// interface exported from this package's root (`<source>:<exportName>`), so a
// param typed `IResolver` and this constant unify on the same string.

import { tokenfor } from '@rhombus-std/primitives';
import type { IResolver, IResolveScope } from './provider.js';
import type { Token } from './types.js';

/**
 * The token a `IResolver`-typed parameter derives to. The engine resolves it to
 * the live provider view (the scope-generic-free `IResolver` surface, per #24)
 * relative to the resolving frame, rather than to a registration. Exported so a
 * plugin-less author can hand-feed it in a signature (`[[RESOLVER_TOKEN]]`)
 * without spelling the package-qualified string by hand.
 */
export const RESOLVER_TOKEN: Token = tokenfor<IResolver>();

/**
 * The deprecated `IResolveScope` contract token — still recognized so a param
 * typed with that non-generic alias resolves to the provider view too.
 */
const RESOLVE_SCOPE_TOKEN: Token = tokenfor<IResolveScope>();

/** The set of tokens the engine treats as the intrinsic provider. */
const PROVIDER_TOKENS: ReadonlySet<Token> = new Set([
  RESOLVER_TOKEN,
  RESOLVE_SCOPE_TOKEN,
]);

/**
 * True when `token` is an intrinsic provider token — one the engine resolves to
 * the live provider view instead of a registration. Always satisfiable during
 * signature selection, and reported as a service by `isService`.
 */
export function isProviderToken(token: Token): boolean {
  return PROVIDER_TOKENS.has(token);
}

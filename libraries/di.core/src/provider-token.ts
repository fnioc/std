// The intrinsic provider token — the seam that makes "I want the provider" plain
// DI. A constructor or factory parameter typed `IResolver` derives the ordinary
// token below, exactly like any other parameter and with no dedicated slot kind;
// the resolution engine recognizes it and hands back the nearest open scope's
// provider VIEW instead of looking up a registration.
//
// The token is the one derived for the non-generic `IResolver` interface exported
// from this package's root (`<source>:<exportName>`), so a parameter typed
// `IResolver` and this constant unify on the same string.

import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IResolver } from './provider.js';
import type { Token } from './types.js';

/**
 * The token a `IResolver`-typed parameter derives to. The engine resolves it to
 * the live provider view relative to the resolving frame, rather than to a
 * registration. Exported so a hand-written signature can name it
 * (`[[RESOLVER_TOKEN]]`) instead of spelling the package-qualified string.
 */
export const RESOLVER_TOKEN: Token = tokenfor<IResolver>();

/**
 * True when `token` is an intrinsic provider token — one the engine resolves to
 * the live provider view instead of a registration. Always satisfiable during
 * signature selection, and reported as a service by `isService`.
 */
export function isProviderToken(token: Token): boolean {
  return token === RESOLVER_TOKEN;
}

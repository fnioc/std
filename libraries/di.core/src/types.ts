import type { Ctor, Func } from '@rhombus-toolkit/func';
// The Token TYPE only, a type-only import (erased from emit) from the
// `@rhombus-std/primitives` PUBLIC barrel -- never the publish-unreachable
// `internal/*` subpath. Token is hoisted to primitives (docs/decisions.md §38) so
// the augmentation registry can key its bags on it without a di.core dependency
// (di ⊥ config); di.core re-exports it UNCHANGED below.
import type { Token } from '@rhombus-std/primitives';

/**
 * Anything a dependency signature can describe: a class constructor (its deps
 * are the ctor parameters) or a factory function (its deps are the call
 * parameters). The `never[]` rest keeps any concrete function assignable here
 * regardless of its own parameter list.
 */
export type DepTarget = Ctor | Func<never[], unknown>;

// `Token` is hoisted to `@rhombus-std/primitives` (docs/decisions.md §38) so the
// augmentation registry can key its bags on it without a di.core dependency
// (di ⊥ config). di.core re-exports it UNCHANGED, so every consumer importing
// `Token` from `@rhombus-std/di.core` keeps working.
export type { Token };

/**
 * Marks a constructor parameter to be injected as a *factory* producing the
 * registered type token, rather than a resolved instance. The factory's own
 * call signature is determined by the caller-supplied `params` list.
 *
 * `type` is the token of the produced type T (replaces the former `.factory` field).
 * `params` is the complete, authored-order list of caller-supplied parameter tokens;
 * when present it pins the factory shape so it no longer drifts with registration state.
 */
export interface FactoryRef {
  readonly type: Token;
  readonly params?: readonly Token[];
}

/**
 * A set of alternative dependency slots tried in declaration order (first
 * resolvable member wins). If no member is resolvable, resolution throws.
 * Each member is itself a `DepSlot` — nesting is allowed.
 */
export interface Union {
  readonly union: readonly DepSlot[];
}

/**
 * A SINGULAR (non-union) type that supplies its value directly — no container
 * lookup. Emitted for:
 *   - a non-union literal param (`"dev"`, `42`, `true`, `1n`) → its value, and
 *   - a whole-type `void` / `undefined` → `undefined`; a whole-type `null` →
 *     `null` (a singleton type has exactly one inhabitant, so it is supplied
 *     directly, NOT tokenized — Rule 2).
 * The engine injects `value` verbatim. A LITERAL/typed UNION (`"a" | "b"`,
 * `Foo | undefined`) is NOT a `LiteralRef`: a literal union stays a resolved
 * token, and a nullish union is stripped by the optional/overload path. Always
 * satisfiable — the value is self-supplying.
 *
 * NOTE: `value` may legitimately be `undefined` (the `void`/`undefined` case),
 * so a `LiteralRef` is identified by the PRESENCE of the `value` key, never by
 * `value !== undefined`. See `isLiteralRef`.
 */
export interface LiteralRef {
  readonly value: string | number | boolean | bigint | undefined | null;
}

/**
 * Marks a parameter to be injected with the TOKEN STRING of one of the
 * registration's type arguments — the `typeof(T)` analog for open-generic
 * templates. `typeArg` is the 1-based hole number (`{ typeArg: 1 }` names the
 * argument bound to `$1`). At close time, substitution replaces the slot with
 * a `LiteralRef` carrying the substituted argument's token string; a raw
 * (unsubstituted) `TypeArgRef` reaching resolution is an error.
 */
export interface TypeArgRef {
  readonly typeArg: number;
}

/**
 * One positional slot in a constructor / factory signature:
 *   - a `Token` string  — a container-resolved dependency (a plain `IResolver`
 *     token resolves to the live provider view — see `RESOLVER_TOKEN`),
 *   - a `FactoryRef`    — a factory-injected parameter (see `FactoryRef`),
 *   - a `Union`         — member-level alternatives tried in order,
 *   - a `LiteralRef`    — a singular literal supplying its value directly, or
 *   - a `TypeArgRef`    — the token string of a type argument (see `TypeArgRef`).
 */
export type DepSlot = Token | FactoryRef | Union | LiteralRef | TypeArgRef;

/**
 * Per-constructor dependency metadata carried on a registration.
 *
 * `signatures` is an array of arrays: each element is one constructor signature
 * (for overload support). `signatures[i][j]` is the `DepSlot` — a token, a
 * `FactoryRef`, a `Union`, or a `LiteralRef` — for constructor parameter `j` of
 * overload `i`.
 */
export interface DepRecord {
  readonly signatures: readonly (readonly DepSlot[])[];
}

/**
 * The result of parsing a closed-generic token `base<arg1,arg2>` into its base
 * and top-level args. A pure data shape (the parse routine that produces it is a
 * runtime helper that lives in `@rhombus-std/di`); kept here so the type surface a
 * consumer references stays in the types-only substrate.
 */
export interface ParsedToken {
  readonly base: Token;
  readonly args: readonly Token[];
}

// The authoring brands (`Inject`, `Hole`, `$`, `Typeof`) live in `./brands.ts`
// and the overload-extraction utilities (`OverloadedParameters`,
// `OverloadedConstructorParameters`) live in `./overloads.ts` -- split out as
// their own cohesive concerns (see docs/decisions.md #46).

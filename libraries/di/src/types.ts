// Shared runtime types for the engine: the concrete-constructor shape, the
// registration kinds, and the resolver-facing provider contract.

import type { DepSlot, Token, Union } from "@rhombus-std/di.core";
import type { Ctor, Func } from "@rhombus-toolkit/func";

export type { Union };

export type { Ctor };

// The consumer-facing ABSTRACTION interfaces — the resolution + scope seams, the
// public provider surface, the deprecated `ResolveScope`, and the `Lifetime` tag
// — now live in the pure-types `@rhombus-std/di.core` package (the MEDI.Abstractions
// analog). di re-exports them so the whole surface stays reachable through one
// `@rhombus-std/di` import, exactly as before the split. The concrete
// `ServiceProviderClass` that implements the `ServiceProvider` interface is di's
// own runtime (see `scope.ts`).
export type { Lifetime, ResolveScope, Resolver, ScopeFactory, ServiceProvider } from "@rhombus-std/di.core";

/**
 * A registration-level factory function. Its parameters are filled by the
 * engine at resolve time, the same way a class constructor's are: a factory
 * WITH registration-carried signatures has each parameter resolved by its slot
 * (token → resolved instance, `ScopeRef` → the live provider, hole →
 * caller-supplied); a factory WITHOUT signatures is the plugin-less escape hatch
 * and is called with the live provider as its single argument (`(sp) => …`).
 *
 * May be async — it can return a `Promise<T>`. The container never awaits; the
 * Promise flows through the sync resolution channel as a value (§"Async as
 * values"). A consumer that depends on it declares `Promise<T>` and awaits.
 */
export type Factory = Func<any[], unknown>;

/** A class registration: a token bound to a concrete constructor. */
export interface ClassRegistration {
  readonly kind: "class";
  readonly ctor: Ctor;
  /**
   * The lifetime — the scope name that owns and caches the instance.
   * `undefined` means transient (never cached; a fresh instance per resolve).
   */
  readonly scope: string | undefined;
  /**
   * Registration-carried dep signatures — the sole signature channel now that
   * the global metadata store is retired. Emitted inline by the transformer
   * (`add(token, ctor, [[...]])`) and hand-fed by the plugin-less caller. A
   * signature-less class with a nonzero-arg ctor throws `MissingMetadataError`;
   * a zero-arg ctor builds via `new Ctor()`.
   */
  readonly signatures?: readonly (readonly DepSlot[])[];
}

/** A factory-function registration — its params are injected like a ctor's. */
export interface FactoryRegistration {
  readonly kind: "factory";
  readonly factory: Factory;
  /**
   * The lifetime — the scope name that owns and caches the result. `undefined`
   * means transient (the factory runs on every resolve). Attached via `.as()`,
   * exactly like a class registration.
   */
  readonly scope: string | undefined;
  /**
   * Registration-carried dep signatures for the factory's call parameters.
   * Emitted inline by the transformer (`addFactory(token, fn, [[...]])`); a
   * record-less factory (the plugin-less escape hatch) carries none and is
   * called with the live provider as its sole argument.
   */
  readonly signatures?: readonly (readonly DepSlot[])[];
}

/** A value registration — an already-built instance, no lifetime. */
export interface ValueRegistration {
  readonly kind: "value";
  readonly useValue: unknown;
}

/** Any registration the engine can resolve. */
export type Registration =
  | ClassRegistration
  | FactoryRegistration
  | ValueRegistration;

/**
 * An OPEN registration — a class bound to an open template token whose type
 * arguments are all holes (`pkg:IRepo<$1>`). It never resolves directly;
 * resolving a closed token that misses the exact map matches against these
 * (base + arity + repeated-hole equality, last registered wins), substitutes
 * the closing's arg tokens through the carried signatures, and synthesizes an
 * ordinary `ClassRegistration` memoized per closed token.
 */
export interface OpenRegistration {
  /** The full template token as registered (`pkg:IRepo<$1>`). */
  readonly template: Token;
  /** The template's base (`pkg:IRepo`) — the open-table key. */
  readonly base: Token;
  /**
   * The parsed top-level args of the template — each exactly a hole (`$N`).
   * Length is the arity; repeated holes (`["$1","$1"]`) constrain a match to
   * equal arg tokens.
   */
  readonly pattern: readonly Token[];
  readonly ctor: Ctor;
  /** The lifetime tag, applied per closing. `undefined` means transient. */
  readonly scope: string | undefined;
  /**
   * The template dep signatures (holes and `TypeArgRef`s still open) —
   * substituted per closing. When absent, the closing has no template to
   * substitute (a zero-arg ctor closes to a bare `new Ctor()`).
   */
  readonly signatures?: readonly (readonly DepSlot[])[];
}


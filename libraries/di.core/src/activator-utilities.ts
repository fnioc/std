// `ActivatorUtilities` — activate a class the container does NOT know about,
// pulling its constructor dependencies FROM a provider. Mirrors the reference DI
// static helper `ActivatorUtilities` (DependencyInjection.Abstractions/src),
// whose whole purpose is instantiating unregistered types (controllers,
// middleware, options factories) with container-injected deps.
//
// The reference reflects the type's constructors, matches supplied arguments to
// parameters BY TYPE, and resolves the rest via `IServiceProvider`. std has no
// runtime reflection and no runtime parameter types, so activation is driven by
// the SAME explicit dependency signature (`DepSlot[]`) the rest of di.core uses:
// a `nameof`-free caller hand-feeds it, exactly as `add(token, ctor, [[...]])`
// does. Each slot is resolved against the provider through its PUBLIC `Resolver`
// surface — activation never enters the `@rhombus-std/di` resolution engine, just
// as the reference never routes through the container's own construction path.
//
// DIVERGENCES from the reference (each forced by the absence of runtime types /
// reflection / attributes, or by std's design; none add or drop a capability the
// reference's SPIRIT needs):
//   - Constructor SELECTION is gone. A JS class has exactly one constructor, so
//     the reference's longest-match / `IServiceProviderIsService`-guided ctor
//     picking, its multiple-best-length ambiguity error, and the abstract-class
//     guard have no analog.
//   - `[ActivatorUtilitiesConstructor]` preferred-ctor marking is BLOCKED: it is
//     an attribute on one of several ctors, and std has neither multiple ctors nor
//     a decorator-free attribute analog. Nothing to port.
//   - Keyed services are not part of std's model, so the keyed-parameter paths are
//     dropped.
//   - Supplied ARGUMENTS are matched to constructor slots POSITIONALLY, not by
//     type: a slot the provider can satisfy is resolved from the provider; a slot
//     it cannot is filled by the next supplied argument, left to right. This
//     mirrors the reference's net effect (service slots from the container,
//     non-service slots from the caller) without the type-assignability matching
//     std cannot perform.
//   - The slot resolver here is a di.core-local, synchronous mirror of the
//     engine's private `#resolveSlot` over the public `Resolver`. Async unions and
//     the `Promise<T>` fallback are engine-only; activation is synchronous, as in
//     the reference.

import { ActivationError } from "./errors.js";
import { isFactoryRef, isLiteralRef, isTypeArgRef, isUnionSlot } from "./guards.js";
import type { Resolver } from "./provider.js";
import type { Ctor } from "./registrations.js";
import type { DepSlot, Token } from "./types.js";

/**
 * A pre-built activator — the reference `ObjectFactory` / `ObjectFactory<T>`
 * analog. Given a provider and an optional positional argument list, builds a
 * fresh instance: constructor slots the provider can satisfy resolve from it, the
 * rest are drawn from `args` left to right (see `createFactory`).
 */
export type ObjectFactory<T = unknown> = (
  provider: Resolver,
  args?: readonly unknown[],
) => T;

/**
 * True when `slot` can be filled from the provider alone — no supplied argument
 * needed. A `FactoryRef` / `LiteralRef` is always injectable; a `Union` is
 * satisfiable iff some member is; a raw `TypeArgRef` never is (only substitution
 * closes it); a string token is satisfiable iff the provider reports it a service
 * (`isService` also answers true for the intrinsic provider token). The public
 * mirror of the engine's `#isResolvableSlot`, restricted to what the `Resolver`
 * surface exposes.
 */
function slotResolvable(provider: Resolver, slot: DepSlot): boolean {
  if (isFactoryRef(slot) || isLiteralRef(slot)) {
    return true;
  }
  if (isTypeArgRef(slot)) {
    return false;
  }
  if (isUnionSlot(slot)) {
    return slot.union.some((member) => slotResolvable(provider, member));
  }
  return provider.isService(slot);
}

/**
 * Resolves a single `DepSlot` against the provider's PUBLIC surface — the
 * synchronous mirror of the engine's `#resolveSlot`. A `FactoryRef` yields a
 * callable (`resolveFactory`); a `Union` returns the first resolvable member; a
 * `LiteralRef` supplies its value; a raw `TypeArgRef` is an error; a string token
 * resolves through the throwing `resolve`. Only reached for slots `slotResolvable`
 * has already cleared, so the `resolve` call misses only for a downstream reason
 * (a missing nested dep, a cycle) — which is the faithful build-time failure.
 */
function resolveSlot(provider: Resolver, slot: DepSlot, ctorName: string): unknown {
  if (isFactoryRef(slot)) {
    return provider.resolveFactory(slot.type, slot.params);
  }
  if (isUnionSlot(slot)) {
    for (const member of slot.union) {
      if (slotResolvable(provider, member)) {
        return resolveSlot(provider, member, ctorName);
      }
    }
    throw new ActivationError(ctorName);
  }
  if (isLiteralRef(slot)) {
    return slot.value;
  }
  if (isTypeArgRef(slot)) {
    throw new ActivationError(ctorName);
  }
  return provider.resolve(slot);
}

/**
 * Builds the constructor argument list: each slot the provider can satisfy is
 * resolved from it; each slot it cannot is drawn from `args` left to right. A slot
 * that is neither provider-resolvable nor covered by a remaining supplied argument
 * is an `ActivationError` (the reference's "Unable to resolve service" — a slot
 * with no source).
 */
function buildArguments(
  provider: Resolver,
  ctor: Ctor,
  signature: readonly DepSlot[],
  args: readonly unknown[],
): unknown[] {
  let argCursor = 0;
  return signature.map((slot) => {
    if (slotResolvable(provider, slot)) {
      return resolveSlot(provider, slot, ctor.name);
    }
    if (argCursor < args.length) {
      return args[argCursor++];
    }
    throw new ActivationError(ctor.name, typeof slot === "string" ? slot : undefined);
  });
}

/**
 * `ActivatorUtilities` — the reference static helper's std analog. A named object
 * literal (name parity with the reference static class) of plain helper functions;
 * NOT an augmentation set (its members act on a PROVIDER, not on the registration
 * collection), so it installs no prototype methods.
 */
export const ActivatorUtilities = {
  /**
   * Instantiates `ctor`, resolving its dependency `signature` from `provider` and
   * filling any provider-unsatisfiable slot from `args` (left to right). The
   * reference `CreateInstance(provider, type, params)`.
   *
   * `signature` is the constructor's positional dep slots — required to inject
   * anything, since std cannot reflect them (a plugin-less caller hand-feeds it,
   * as with `add`). Omit it (or pass empty) for a constructor with no injected
   * dependencies, in which case `args` are passed positionally: `new ctor(...args)`.
   */
  createInstance(
    provider: Resolver,
    ctor: Ctor,
    signature?: readonly DepSlot[],
    ...args: readonly unknown[]
  ): unknown {
    return ActivatorUtilities.createFactory(ctor, signature)(provider, args);
  },

  /**
   * Pre-builds an `ObjectFactory` for `ctor` — the reference
   * `CreateFactory(type, argumentTypes)`. The returned factory takes a provider
   * and an optional positional argument list and builds a FRESH instance on every
   * call: signature slots the provider can satisfy resolve from it, the rest are
   * drawn from the supplied arguments left to right.
   *
   * A signature-less (or empty-signature) `ctor` is treated as taking only direct
   * arguments — the factory is `(provider, args) => new ctor(...args)`.
   */
  createFactory<T = unknown>(
    ctor: Ctor,
    signature?: readonly DepSlot[],
  ): ObjectFactory<T> {
    const slots = signature ?? [];
    return (provider, args = []): T => {
      if (slots.length === 0) {
        return new ctor(...args) as T;
      }
      return new ctor(...buildArguments(provider, ctor, slots, args)) as T;
    };
  },

  /**
   * Returns `token`'s registered service if the provider has one, otherwise
   * activates `ctor`. The reference `GetServiceOrCreateInstance(provider, type)`,
   * whose single `type` is both the lookup key and the type to build; std keeps
   * them separate — a `Token` string keys the lookup, a `Ctor` value is what gets
   * constructed on a miss.
   */
  getServiceOrCreateInstance(
    provider: Resolver,
    token: Token,
    ctor: Ctor,
    signature?: readonly DepSlot[],
  ): unknown {
    const existing = provider.tryResolve(token);
    if (existing !== undefined) {
      return existing;
    }
    return ActivatorUtilities.createInstance(provider, ctor, signature);
  },
};

// The type-level authoring surface a LIBRARY AUTHOR programs against to
// contribute registrations WITHOUT pulling the `@rhombus-std/di` runtime. The
// interface machinery here erases completely; the concrete `ServiceManifestClass`
// that implements it ships alongside (runtime) in this same package.
//
// PREFERRED authoring shape — a fluent AUGMENTATION (the §0 directive: the
// reference stack's extension methods become fluent side-effect augmentations;
// §28/§38). `ServiceManifest` is an OPEN receiver — downstream families extend it
// — so a cross-package author authors ONE named const `satisfies
// AugmentationSet<R>`, `declare module`s its member onto the interface below, and
// REGISTERS it against the shared `ServiceManifest` token beside that merge. The
// concrete `ServiceManifestClass` is `@augment`-decorated in di.core, so the
// registration reaches its prototype and a caller writes `services.addMyThing(...)`
// fluently — even when this package loaded before the extender:
//
//   // my-augmentation.ts (side-effect module, "sideEffects": true)
//   import type { ServiceManifest, ServiceManifestClass } from "@rhombus-std/di.core";
//   import { registerAugmentations } from "@rhombus-std/primitives";
//   import type { AugmentationSet } from "@rhombus-std/primitives";
//   import { tokenfor } from "@rhombus-std/primitives.extras";
//   declare module "@rhombus-std/di.core" {
//     interface IServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
//       addMyThing(): IServiceManifest<Scopes>;
//     }
//     interface ServiceManifestClass<Scopes extends string = "singleton"> {
//       addMyThing(): IServiceManifest<Scopes>;
//     }
//   }
//   export const MyThingAugmentations = {
//     addMyThing(manifest: ServiceManifestClass<string>) {
//       return manifest.addClass("pkg:IMyThing", MyThing, [[]], "singleton");
//     },
//   } satisfies AugmentationSet<ServiceManifestClass<string>>;
//   registerAugmentations(tokenfor<IServiceManifest>(), MyThingAugmentations);
//
// This mirrors how `@rhombus-std/config` adds `addJsonFile` to
// `ConfigBuilder`, and depends on di.core ALONE — never the di runtime. The
// exported const's member (`MyThingAugmentations.addMyThing(services, …)`) is also
// the standalone call surface; slots are authored as plain `DepSlot` data literals
// either way.
//
// NOTE the RETURN: a manifest is IMMUTABLE, so an augmentation that registers
// anything must hand back the manifest its registrations produced — never `this`,
// and never a discarded intermediate. Its caller keeps the result
// (`services = services.addMyThing()`).

import type { Ctor } from '@rhombus-toolkit/func';
import type { IServiceManifest } from './IServiceManifest.js';
import type { Factory, ManifestEntry } from './registrations.js';
import type { ServiceProviderOptions } from './ServiceProviderOptions.js';
import type { DepSignatures, DepSlot, Token } from './types.js';

/**
 * The four refinable facets of a pending registration. Two of them are the ways a
 * dependency signature is supplied, and they behave differently:
 *   - `'signature'`  — APPEND one overload's slots (`withSignature`, repeatable),
 *   - `'signatures'` — REPLACE the whole signature set in bulk (`withSignatures`, once),
 *   - `'scope'`      — the lifetime that owns the registration (`as`), and
 *   - `'key'`        — the key its token is suffixed with (`withKey`).
 *
 * A registration call hands back a chain node whose remaining slots are exactly
 * those it did NOT already fill positionally; each fluent modifier consumes its
 * own slot(s) and hands back a node without them, so a bulk-replace or a scope or
 * a key can be set AT MOST ONCE (an append is deliberately repeatable) and the
 * modifiers may be applied in any order.
 */
export type Slot = 'signature' | 'signatures' | 'scope' | 'key';

/**
 * The node a registration call returns: a manifest face (`build` / `addClass` /
 * `seal` / …) widened with exactly the modifier faces for the slots still
 * unfilled. Two type parameters drive the shape.
 *
 * `Gated` splits the plugin-less world from the transformer world:
 *
 * - **`Gated = true` (plugin-less, no-sugar).** A signature is mandatory. While
 *   the `'signatures'` slot is still present — meaning NO signature has been
 *   supplied yet, the state of the bare 2-arg `addClass(token, ctor)` form — the
 *   MANIFEST FACE IS WITHHELD (`'signatures' extends Slots ? unknown : …`), so
 *   `build` / `addClass` / `seal` are absent and the chain cannot be finished.
 *   `withSignature` / `withSignatures` supplies a signature, strikes `'signatures'`,
 *   and the manifest face reappears. `.as()` / `.withKey()` refine WITHOUT opening
 *   the gate (they leave `'signatures'` in place). Supplying the signature
 *   POSITIONALLY (the 3+-arg overloads) strikes `'signatures'` up front, so those
 *   chains start ungated.
 * - **`Gated = false` (transformer sugar).** The signature is derived from the
 *   type argument, so the manifest is ALWAYS present and `withSignature` /
 *   `withSignatures` are OVERRIDES, not a gate.
 *
 * `Slots` drives the widening — `Exclude`ing a slot on each modifier's return is
 * what makes `.as(...).as(...)` a compile error while a surviving-slot order
 * type-checks. The result is a NEW value (nothing mutates), so it must be kept
 * (`services = services.addClass(...)`), never discarded.
 */
export type AddChain<S extends string, Slots extends Slot, Gated extends boolean> =
  & (Gated extends true ? ('signatures' extends Slots ? unknown : IServiceManifest<S>) : IServiceManifest<S>)
  & ('signature' extends Slots ? IWithSignatureBuilder<S, Slots, Gated> : unknown)
  & ('signatures' extends Slots ? IWithSignaturesBuilder<S, Slots, Gated> : unknown)
  & ('scope' extends Slots ? IAsBuilder<S, Slots, Gated> : unknown)
  & ('key' extends Slots ? IWithKeyBuilder<S, Slots, Gated> : unknown);

/**
 * The `signature`-slot face — APPENDS one overload's dependency slots onto the
 * registration's signature set, and is REPEATABLE (it strikes `'signatures'`, the
 * bulk slot, but never itself). Each call adds one more injectable overload.
 *
 * On the gated 2-arg form (`Gated = true`, no signature yet) the first
 * `withSignature` supplies the initial overload and OPENS the gate — the manifest
 * face reappears — and further `withSignature`s append more overloads. After a
 * POSITIONAL signature (the 3+-arg overloads, already ungated) it appends
 * additional overloads to the one given; that is exactly what a hand author could
 * write as `addClass(t, c, [[…]]).withSignature('a')`, which keeps the survive
 * lowering byte-parity. Under sugar (`Gated = false`) it is an override that
 * appends onto the derived signature.
 */
export interface IWithSignatureBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
  withSignature(...slots: readonly DepSlot[]): AddChain<S, Exclude<Slots, 'signatures'>, Gated>;
}

/**
 * The `signatures`-slot face — REPLACES the whole signature set in one bulk call,
 * and is once-only: it strikes BOTH `'signature'` and `'signatures'`, so it is
 * reachable only before any signature was supplied (the gated 2-arg form) and can
 * never follow a `withSignature` append. It opens the gate.
 */
export interface IWithSignaturesBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
  withSignatures(
    ...signatures: ReadonlyArray<readonly DepSlot[]>
  ): AddChain<S, Exclude<Slots, 'signature' | 'signatures'>, Gated>;
}

/**
 * The `scope`-slot face — attaches the lifetime. Must name a declared scope
 * (`Scopes` is threaded so the tag is checked at the registration site). A
 * registration that never names a scope is transient: absence of a scope IS
 * transient, there is no `"transient"` tag.
 *
 * `.as(scope)` returns a NEW manifest carrying a scoped copy of the pending
 * registration over the same predecessor — it REPLACES its own node rather than
 * appending, so one `.addClass(...).as(...)` chain stays exactly one registration.
 * It does NOT strike `'signatures'`, so under the gate it refines without
 * finishing the chain.
 */
export interface IAsBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
  as(scope: S): AddChain<S, Exclude<Slots, 'scope'>, Gated>;
}

/**
 * The `key`-slot face — turns the registration into a KEYED one by recomposing
 * its effective token as `base#key` (§98). Because the recomposed token is
 * re-classified, `withKey` can raise the same open-token registration error the
 * originating call would have. Like `.as()`, it does NOT open the gate.
 */
export interface IWithKeyBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
  withKey(key: string): AddChain<S, Exclude<Slots, 'key'>, Gated>;
}

/**
 * The AUTHORING INTERFACE for the registration collection — the base surface a
 * lib author types a setup function against, and the interface the concrete
 * `ServiceManifestClass` (in this same package) implements. It names the three
 * runtime registration verbs (`addClass` / `addFactory` / `addValue`) plus `build`.
 *
 * It is also the interface-first public surface a di consumer holds: di's public
 * `ServiceManifest` type is `IServiceManifestBase<S, IServiceProvider<S>>` (not the
 * impl class), so the type-driven authoring forms (`addClass<I>(C)`,
 * `addFactory<I>(fn)`, `addValue<I>(v)`) the `@rhombus-std/di.transformer`
 * DECLARATION-MERGES onto this interface surface on a consumer's
 * `services.addClass<I>(...)`. An interface picks up those merged overloads; the
 * impl class would not — the same reason the provider surface is an interface.
 *
 * `Provider` is the type `build()` returns. A core-only lib author never calls
 * `build()` (the application does), so it defaults to `unknown`; `@rhombus-std/di`
 * binds it to the concrete `IServiceProvider<Scopes>` when its class implements
 * this interface. Keeping it generic is what lets this interface live in the
 * types-only substrate without referencing di's runtime provider type.
 *
 * A manifest is IMMUTABLE and is an `Iterable<ManifestEntry>`: every registration
 * verb returns a NEW manifest that yields this one's entries first and its own
 * last, so registration order out of the iteration is authoring order in. Nothing
 * mutates — a call whose result is discarded registers NOTHING.
 */
export interface IServiceManifestBase<
  Scopes extends string = 'singleton',
  Provider = unknown,
> extends Iterable<ManifestEntry> {
  /**
   * Class registration — a string token bound to a concrete constructor.
   *
   * The bare 2-arg form `addClass(token, ctor)` is GATED: it supplies no
   * signature, so the returned chain WITHHOLDS the manifest face (`build` /
   * `addClass` / `seal` absent) until `withSignature`/`withSignatures` supplies
   * one. `.as()` / `.withKey()` refine but do not open the gate.
   *
   * Passing `signatures` POSITIONALLY (the 3+-arg overloads) strikes the bulk
   * `'signatures'` slot up front, so the chain is ungated (manifest present) and
   * only the APPEND face `withSignature` survives — `addClass(t, c, [[…]])
   * .withSignature('a')` appends a second overload. `scope` names the owning
   * lifetime (omit for transient) and `key` composes a keyed registration token
   * `base#key` (§98).
   *
   * Returns a NEW manifest carrying the registration, widened with the modifier
   * faces for whichever slots were not filled positionally. The result must be
   * KEPT — this manifest is unchanged.
   */
  addClass(token: Token, ctor: Ctor): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', true>;
  addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
  ): AddChain<Scopes, 'signature' | 'scope' | 'key', true>;
  addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope: Scopes,
  ): AddChain<Scopes, 'signature' | 'key', true>;
  addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope: Scopes,
    key: string,
  ): AddChain<Scopes, 'signature', true>;
  /**
   * Factory registration — a string token bound to a factory function, its call
   * parameters injected by `signatures`. Same gated 2-arg form and same
   * positional `signatures` / `scope` / `key` tail and new-manifest return as
   * `addClass`.
   */
  addFactory(token: Token, factory: Factory): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', true>;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
  ): AddChain<Scopes, 'signature' | 'scope' | 'key', true>;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: Scopes,
  ): AddChain<Scopes, 'signature' | 'key', true>;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: Scopes,
    key: string,
  ): AddChain<Scopes, 'signature', true>;
  /**
   * Value registration — an already-built instance, no deps and no lifetime, so
   * it takes neither `signatures` nor `scope`. The optional trailing `key`
   * composes a keyed registration token `base#key` (§98). Returns the new
   * manifest with no modifier faces: there is no slot left to fill.
   */
  addValue(token: Token, value: unknown): IServiceManifest<Scopes>;
  addValue(token: Token, value: unknown, key: string): IServiceManifest<Scopes>;
  /**
   * Seals the collection and returns the built provider. `options` configures
   * the provider's validation behaviors (`validateScopes` / `validateOnBuild`,
   * both defaulting to `false`) — the reference `BuildServiceProvider(services,
   * options)` overload collapsed into one optional parameter (the reference's
   * bare-`bool validateScopes` convenience overload is deliberately not
   * mirrored: a positional boolean is opaque at the call site; write
   * `build({ validateScopes: true })`).
   */
  build(options?: ServiceProviderOptions): Provider;
}

/**
 * A single MUTABLE slot holding the current manifest — the seam a long-lived
 * builder wrapper (`ILoggingBuilder`, `IMetricsBuilder`, the host application
 * builder) exposes as its `services` property.
 *
 * The manifest chain itself is immutable, so a wrapper cannot register anything
 * "into" the manifest it was handed; it reassigns the slot to whatever the
 * registration returned. Handing the SAME holder to several wrappers is what
 * keeps them on one chain: a `builder.logging.addProvider(...)` and a
 * `builder.services = builder.services.addClass(...)` both land in the one slot,
 * so neither silently drops the other's registrations.
 */
export interface IServiceManifestHolder<Scopes extends string = 'singleton'> {
  /** The current manifest. Reassigned by every registration made through the holder. */
  services: IServiceManifest<Scopes>;
}

// The public authoring INTERFACE `ServiceManifest<S>` — `IServiceManifestBase`
// bound to the concrete `IServiceProvider<S>` that `build()` returns — is defined
// in `./IServiceManifest.ts` alongside the `ServiceManifestClass` that implements
// it. The static / constructor side (`ServiceManifestCtor`) and the constructible
// `ServiceManifest` VALUE are a RUNTIME concern and live in `@rhombus-std/di`,
// which also patches `build()` onto the concrete class's prototype.

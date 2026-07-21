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
//   import { nameof } from "@rhombus-std/primitives";
//   declare module "@rhombus-std/di.core" {
//     interface IServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
//       addMyThing(): IServiceManifest<Scopes>;
//     }
//     interface ServiceManifestClass<Scopes extends string = "singleton"> {
//       addMyThing(): IServiceManifest<Scopes>;
//     }
//   }
//   export const MyThingExtensions = {
//     addMyThing(manifest: ServiceManifestClass<string>) {
//       return manifest.add("pkg:IMyThing", MyThing, [[]], "singleton");
//     },
//   } satisfies AugmentationSet<ServiceManifestClass<string>>;
//   registerAugmentations(nameof<IServiceManifest>(), MyThingExtensions);
//
// This mirrors how `@rhombus-std/config` adds `addJsonFile` to
// `ConfigBuilder`, and depends on di.core ALONE — never the di runtime. The
// exported const's member (`MyThingExtensions.addMyThing(services, …)`) is also the
// standalone call surface; slots are authored as plain `DepSlot` data literals
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
import type { DepSignatures, Token } from './types.js';

/**
 * The three refinable facets of a pending registration — the `signatures` it
 * injects by, the `scope` that owns it, and the `key` its token is suffixed with.
 * A registration call hands back a chain node whose remaining slots are exactly
 * those it did NOT already fill positionally; each fluent modifier consumes its
 * own slot and hands back a node without it, so a slot can be set AT MOST ONCE
 * and the modifiers may be applied in any order.
 */
export type Slot = 'signature' | 'scope' | 'key';

/**
 * The node a registration call returns: a FULL manifest (every registration verb
 * plus `build`), widened with exactly the modifier faces for the slots still
 * unfilled. `Slots` is what drives the widening — `Exclude`ing a slot on each
 * modifier's return is what makes `.as(...).as(...)` a compile error while
 * `.withKey(...).as(...)` and `.as(...).withKey(...)` both type-check.
 *
 * The node IS a manifest, so a chain never has to be "finished": `.add(...)` and
 * `.build()` are reachable at every step, and the manifest a chain hands back is
 * a NEW value — nothing mutates, so the result must be kept
 * (`services = services.add(...)`), never discarded.
 */
export type AddChain<S extends string, Slots extends Slot> =
  & IServiceManifest<S>
  & ('signature' extends Slots ? IWithSignatureBuilder<S, Slots> : unknown)
  & ('scope' extends Slots ? IAsBuilder<S, Slots> : unknown)
  & ('key' extends Slots ? IWithKeyBuilder<S, Slots> : unknown);

/**
 * The `signature`-slot face. Only ever reachable on a TRANSFORMER-authored call:
 * the plugin-less overloads take `signatures` positionally (it is required, since
 * a plugin-less caller cannot derive it), so their chain starts with the slot
 * already consumed. Under the transformer the derived signature is injected, and
 * `withSignature` is the optional OVERRIDE — an authored
 * `add<K>(Foo).withSignature(custom)` LOWERS to `add("token", Foo, custom)`, so
 * the call never survives into emitted JS.
 */
export interface IWithSignatureBuilder<S extends string, Slots extends Slot> {
  withSignature(signatures: DepSignatures): AddChain<S, Exclude<Slots, 'signature'>>;
}

/**
 * The `scope`-slot face — attaches the lifetime. Must name a declared scope
 * (`Scopes` is threaded so the tag is checked at the registration site). A
 * registration that never names a scope is transient: absence of a scope IS
 * transient, there is no `"transient"` tag.
 *
 * `.as(scope)` returns a NEW manifest carrying a scoped copy of the pending
 * registration over the same predecessor — it REPLACES its own node rather than
 * appending, so one `.add(...).as(...)` chain stays exactly one registration.
 */
export interface IAsBuilder<S extends string, Slots extends Slot> {
  as(scope: S): AddChain<S, Exclude<Slots, 'scope'>>;
}

/**
 * The `key`-slot face — turns the registration into a KEYED one by recomposing
 * its effective token as `base#key` (§98). Because the recomposed token is
 * re-classified, `withKey` can raise the same open-token registration error the
 * originating call would have.
 */
export interface IWithKeyBuilder<S extends string, Slots extends Slot> {
  withKey(key: string): AddChain<S, Exclude<Slots, 'key'>>;
}

/**
 * The AUTHORING INTERFACE for the registration collection — the base surface a
 * lib author types a setup function against, and the interface the concrete
 * `ServiceManifestClass` (in this same package) implements. It names the three
 * runtime registration methods (`add` / `addFactory` / `addValue`) plus `build`.
 *
 * It is also the interface-first public surface a di consumer holds: di's public
 * `ServiceManifest` type is `IServiceManifestBase<S, IServiceProvider<S>>` (not the
 * impl class), so the type-driven authoring forms (`add<I>(C)`, `addFactory<I>(fn)`,
 * `addValue<I>(v)`) the `@rhombus-std/di.transformer` DECLARATION-MERGES onto this
 * interface surface on a consumer's `services.add<I>(...)`. An interface picks up
 * those merged overloads; the impl class would not — the same reason the provider
 * surface is an interface.
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
   * `signatures` carries the positional dep signatures ON the registration (a lib
   * author authors them as plain `DepSlot` data literals) and is REQUIRED: a
   * plugin-less caller cannot derive it, so a dependency-free ctor states `[[]]`.
   * `scope` names the owning lifetime (omit for transient) and `key` composes a
   * keyed registration token `base#key` (§98).
   *
   * Returns a NEW manifest carrying the registration, widened with the modifier
   * faces for whichever of `scope` / `key` were not passed positionally. The
   * result must be KEPT — this manifest is unchanged.
   */
  add(token: Token, ctor: Ctor, signatures: DepSignatures): AddChain<Scopes, 'scope' | 'key'>;
  add(token: Token, ctor: Ctor, signatures: DepSignatures, scope: Scopes): AddChain<Scopes, 'key'>;
  add(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope: Scopes,
    key: string,
  ): IServiceManifest<Scopes>;
  /**
   * Factory registration — a string token bound to a factory function, its call
   * parameters injected by the REQUIRED `signatures` arg. Same positional
   * `scope` / `key` tail and same new-manifest return as `add`.
   */
  addFactory(token: Token, factory: Factory, signatures: DepSignatures): AddChain<Scopes, 'scope' | 'key'>;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: Scopes,
  ): AddChain<Scopes, 'key'>;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: Scopes,
    key: string,
  ): IServiceManifest<Scopes>;
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
 * `builder.services = builder.services.add(...)` both land in the one slot, so
 * neither silently drops the other's registrations.
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

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
//       addMyThing(): this;
//     }
//     interface ServiceManifestClass<Scopes extends string = "singleton"> {
//       addMyThing(): this;
//     }
//   }
//   export const MyThingExtensions = {
//     addMyThing(manifest: ServiceManifestClass<string>) { … return manifest; },
//   } satisfies AugmentationSet<ServiceManifestClass<string>>;
//   registerAugmentations(nameof<IServiceManifest>(), MyThingExtensions);
//
// This mirrors how `@rhombus-std/config` adds `addJsonFile` to
// `ConfigBuilder`, and depends on di.core ALONE — never the di runtime. The
// exported const's member (`MyThingExtensions.addMyThing(services, …)`) is also the
// standalone call surface; slots are authored as plain `DepSlot` data literals
// either way.

import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { ServiceProviderOptions } from './ServiceProviderOptions.js';
import type { DepSlot, Token } from './types.js';

/**
 * The continuation returned by a class `ServiceManifest.add`. Carries the just-added
 * registration so `.as()` can attach its lifetime in place. An `.add()` with no
 * trailing `.as()` leaves the registration scopeless ⇒ transient.
 *
 * `Scopes` is threaded so `.as()` only accepts a declared scope name —
 * compile-time guard at the registration site. The authored type-arg form
 * `.as<"scope">()` is DECLARATION-MERGED onto this interface by the
 * `@rhombus-std/di.transformer` augmentation — a pure typing that surfaces only
 * when the transformer is in the program.
 */
export interface AddBuilder<Scopes extends string> {
  /**
   * Attaches the lifetime — the RUNTIME (lowered) form. Must name a declared
   * scope.
   *
   * `.as("singleton")` is what the engine executes: the transformer rewrites the
   * authored type-arg form (`.as<"singleton">()`) to this value-arg form before
   * runtime, and a plugin-less caller writes it directly. The AUTHORED type-arg
   * form (`.as<S extends Scopes>(): void`) is a PURE TYPING contributed by the
   * `@rhombus-std/di.transformer` augmentation — it is not part of di's published surface,
   * so it only type-checks when the transformer's types are in the program.
   */
  as(scope: Scopes): void;
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
 */
export interface IServiceManifestBase<
  Scopes extends string = 'singleton',
  Provider = unknown,
> {
  /**
   * Class registration — a string token bound to a concrete constructor. The
   * optional third `signatures` arg carries the positional dep signatures ON the
   * registration (a lib author authors them as plain `DepSlot` data literals). The
   * optional trailing `key` composes a keyed registration token `base#key` (§98);
   * a falsy/omitted key registers under the bare token.
   */
  add(
    token: Token,
    ctor: Ctor,
    signatures?: readonly (readonly DepSlot[])[],
    key?: string,
  ): AddBuilder<Scopes>;
  /**
   * Factory registration — a string token bound to a factory function, its call
   * parameters injected by the optional third `signatures` arg. The optional
   * trailing `key` composes a keyed registration token `base#key` (§98).
   */
  addFactory(
    token: Token,
    factory: Func<any[], unknown>,
    signatures?: readonly (readonly DepSlot[])[],
    key?: string,
  ): AddBuilder<Scopes>;
  /**
   * Value registration — an already-built instance, no deps and no lifetime. The
   * optional trailing `key` composes a keyed registration token `base#key` (§98).
   */
  addValue(token: Token, value: unknown, key?: string): void;
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

// The public authoring INTERFACE `ServiceManifest<S>` — `IServiceManifestBase`
// bound to the concrete `IServiceProvider<S>` that `build()` returns — is defined
// in `./IServiceManifest.ts` alongside the `ServiceManifestClass` that implements
// it. The static / constructor side (`ServiceManifestCtor`) and the constructible
// `ServiceManifest` VALUE are a RUNTIME concern and live in `@rhombus-std/di`,
// which also patches `build()` onto the concrete class's prototype.

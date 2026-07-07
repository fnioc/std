// The type-level authoring surface a LIBRARY AUTHOR programs against to
// contribute registrations WITHOUT pulling the `@rhombus-std/di` runtime. The
// interface machinery here erases completely; the concrete `ServiceManifestClass`
// that implements it ships alongside (runtime) in this same package.
//
// PREFERRED authoring shape — an EXTENSION-METHOD augmentation (the §0
// directive: ME extension methods become fluent side-effect augmentations). A
// cross-package fluent author `declare module`s the method onto the interface
// below AND prototype-patches the concrete `ServiceManifestClass` at import
// time, so a caller writes `services.addMyThing(...)` fluently:
//
//   // my-augmentation.ts (side-effect module, "sideEffects": true)
//   import { ServiceManifestClass } from "@rhombus-std/di.core";
//   declare module "@rhombus-std/di.core" {
//     interface ServiceManifestBase<Scopes extends string> {
//       addMyThing(): this;
//     }
//   }
//   ServiceManifestClass.prototype.addMyThing = function () { … return this; };
//
// This mirrors how `@rhombus-std/config` adds `addJsonFile` to
// `ConfigurationBuilder`, and depends on di.core ALONE — never the di runtime.
// A plain free function (`addMyThing(services)`) still works for callers who
// prefer it; slots are authored as plain `DepSlot` data literals either way.

import type { Ctor, Func } from "@rhombus-toolkit/func";
import type { DepSlot, Token } from "./types.js";

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
 * `ServiceManifest` type is `ServiceManifestBase<S, ServiceProvider<S>>` (not the
 * impl class), so the type-driven authoring forms (`add<I>(C)`, `addFactory<I>(fn)`,
 * `addValue<I>(v)`) the `@rhombus-std/di.transformer` DECLARATION-MERGES onto this
 * interface surface on a consumer's `services.add<I>(...)`. An interface picks up
 * those merged overloads; the impl class would not — the same reason the provider
 * surface is an interface.
 *
 * `Provider` is the type `build()` returns. A core-only lib author never calls
 * `build()` (the application does), so it defaults to `unknown`; `@rhombus-std/di`
 * binds it to the concrete `ServiceProvider<Scopes>` when its class implements
 * this interface. Keeping it generic is what lets this interface live in the
 * types-only substrate without referencing di's runtime provider type.
 */
export interface ServiceManifestBase<
  Scopes extends string = "singleton",
  Provider = unknown,
> {
  /**
   * Class registration — a string token bound to a concrete constructor. The
   * optional third `signatures` arg carries the positional dep signatures ON the
   * registration (a lib author authors them as plain `DepSlot` data literals).
   */
  add(
    token: Token,
    ctor: Ctor,
    signatures?: readonly (readonly DepSlot[])[],
  ): AddBuilder<Scopes>;
  /**
   * Factory registration — a string token bound to a factory function, its call
   * parameters injected by the optional third `signatures` arg.
   */
  addFactory(
    token: Token,
    factory: Func<any[], unknown>,
    signatures?: readonly (readonly DepSlot[])[],
  ): AddBuilder<Scopes>;
  /** Value registration — an already-built instance, no deps and no lifetime. */
  addValue(token: Token, value: unknown): void;
  /** Seals the collection and returns the built provider. */
  build(): Provider;
}

// The public authoring INTERFACE `ServiceManifest<S>` — `ServiceManifestBase`
// bound to the concrete `ServiceProvider<S>` that `build()` returns — is defined
// in `./service-manifest.ts` alongside the `ServiceManifestClass` that implements
// it. The static / constructor side (`ServiceManifestCtor`) and the constructible
// `ServiceManifest` VALUE are a RUNTIME concern and live in `@rhombus-std/di`,
// which also patches `build()` onto the concrete class's prototype.

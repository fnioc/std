// The type-level authoring surface a LIBRARY AUTHOR depends on to type a
// registration setup function WITHOUT pulling the `@rhombus-std/di` runtime. Every
// export here is pure type-level machinery — it erases completely.
//
// A lib author writes a free function that contributes registrations to a
// caller-owned manifest:
//
//   import type { ServiceManifest } from "@rhombus-std/di.core";
//   export function addMyServices(sc: ServiceManifest<"singleton">): void {
//     sc.add("pkg:IThing", Thing, [["pkg:IDep"]]).as("singleton");
//   }
//
// The application supplies a real `@rhombus-std/di` `ServiceManifest` value; its class
// structurally satisfies the `ServiceManifestBase` interface below. Slots are
// authored as plain data literals typed by `DepSlot` — no runtime helper import
// is needed.

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
 * lib author types a setup function against, and the interface `@rhombus-std/di`'s
 * `ServiceManifestClass` implements. It names the three runtime registration
 * methods (`add` / `addFactory` / `addValue`) plus `build`.
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

/**
 * The full public authoring TYPE — currently identical to `ServiceManifestBase`,
 * kept as its own name for the surface a lib author's setup function is typed
 * against (the pre-#3 shape intersected this with the per-scope
 * `add${ProperCase<K>}` methods minted from `S`; `add(C).as("scope")` is the
 * only registration form now).
 */
export interface ServiceManifest<
  Scopes extends string = "singleton",
  Provider = unknown,
> extends ServiceManifestBase<Scopes, Provider> {}

// The static / constructor side of the public `ServiceManifest` — the `new
// <S>() => ServiceManifest<S>` signature — is a RUNTIME concern (it describes
// constructing a concrete class), not an authoring contract. It lives in
// `@rhombus-std/di` as `ServiceManifestCtor`, alongside the `ServiceManifestClass`
// it constructs.

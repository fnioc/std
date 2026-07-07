// The registration builder. Holds the base token → registration list map and
// builds the ServiceProvider. Three registration surfaces:
//   - `add`        — a class (its ctor deps are injected),
//   - `addFactory` — a factory function (its call-param deps are injected),
//   - `addValue`   — an already-built instance (no deps, no lifetime).
// The transformer lowers the type-driven authoring forms (`add<I>(C)`,
// `add<I>(fn)`, `addValue<I>(v)`) to these; the explicit-token forms are the
// plugin-less mechanism for overrides, test doubles, and third-party wiring.
// `add<I>(fn)` (a factory) lowers to `addFactory("token", fn)` — the transformer
// statically knows the arg is a function, so the runtime never has to guess
// class-vs-factory.

import type { Func } from "@rhombus-toolkit/func";

import type { AddBuilder, ServiceManifestBase } from "./authoring.js";
import { OpenTokenRegistrationError } from "./errors.js";
import type { ServiceProvider } from "./provider.js";
import type {
  Ctor,
  Factory,
  OpenRegistration,
  Registration,
  SealedManifest,
} from "./registrations.js";
import { HOLE_PATTERN, isOpenToken, parseToken } from "./tokens.js";
import type { DepSlot, Token } from "./types.js";

// The authoring TYPE-machinery — `AddBuilder` and the collection interface
// `ServiceManifestBase` — lives alongside this builder in the abstractions
// package `@rhombus-std/di.core`. The runtime `ServiceManifestClass` implements
// the interface; the engine-constructing half of `build()` is a
// `@rhombus-std/di` extension (see `build()` below).

/** Appends `value` to the list at `key`, creating the list on first use. */
function appendTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [value]);
  } else {
    existing.push(value);
  }
}

/**
 * The registration builder.
 *
 * `Scopes` is the union of declarable scope names — the tags `.as()` and
 * `.createScope()` accept (default `"singleton"`). There is no root: scopes are
 * uniform tags, and `"singleton"` is just a tag you happen to open once at the
 * top. `"transient"` is NOT a member — transient is the absence of a scope, not
 * a scope. A registration whose tagged scope is not open at resolution time
 * resolves transiently (fresh instance, no cache).
 *
 * @example
 * ```ts
 * const services = new ServiceManifest<"singleton" | "request">();
 * services.add("pkg:ILogger", ConsoleLogger).as("singleton"); // lowered form
 * const provider = services.build();              // no frame pre-opened
 * const app = provider.createScope("singleton");  // open the singleton frame
 * const logger = app.resolve<ILogger>("pkg:ILogger");
 * const req = app.createScope("request");         // nested child scope
 * ```
 *
 * NOTE: this is the IMPLEMENTATION class. The public `ServiceManifest` TYPE
 * (below) is the interface consumers hold; the public `ServiceManifest` VALUE
 * (`new ServiceManifest<S>()`) lives in `@rhombus-std/di`, which also patches
 * `build()` onto this prototype. The class is exported so cross-package fluent
 * augmentations can prototype-patch it (their authored typings merge onto the
 * di.core interfaces, never onto this class directly).
 */
export class ServiceManifestClass<Scopes extends string = "singleton">
  implements ServiceManifestBase<Scopes, ServiceProvider<Scopes>>
{
  /**
   * The service collection: each token maps to a LIST of registrations in
   * registration order. Registering a token appends; resolution picks the
   * most-recent (last) registration. Earlier registrations are retained, which
   * is what lets a later `.add()` override an earlier one without deletion.
   */
  readonly #registrations = new Map<Token, Registration[]>();

  /**
   * The OPEN registration table: template base → open registrations in
   * registration order. Resolution matches against it on an exact-map miss
   * (base + arity + repeated-hole equality), most-recent match winning —
   * mirroring the exact map's last-wins list semantics.
   */
  readonly #openRegistrations = new Map<Token, OpenRegistration[]>();

  public constructor() {}

  /** Appends a registration to `token`'s list, creating the list on first use. */
  #append(token: Token, registration: Registration): void {
    appendTo(this.#registrations, token, registration);
  }

  /** Appends an open registration to `base`'s list, mirroring `#append`. */
  #appendOpen(base: Token, registration: OpenRegistration): void {
    appendTo(this.#openRegistrations, base, registration);
  }

  /**
   * Builds the `.as(scope?)` continuation over an `applyScope` callback that
   * REPLACES the just-appended base with a scoped copy for the chosen tag.
   * Shared by the class and open registration paths — both append a base
   * (transient) registration first, then hand back this continuation so a
   * trailing `.as(scope)` swaps that base for the scoped copy IN PLACE.
   *
   * Replacing (not appending) is what keeps ONE `.add(...).as(scope)` chain a
   * SINGLE registration: a spurious transient shadow would be harmless for
   * last-wins bare-T resolution but would pollute collection aggregation
   * (`Array<T>` / `Iterable<T>`), which enumerates every registration of T.
   */
  #scopedContinuation(applyScope: (scope: Scopes) => void): AddBuilder<Scopes> {
    return {
      as<S extends Scopes>(scope?: S): void {
        // The lowered form always passes a value arg; the authored type-arg-only
        // form never executes (the transformer rewrites it first). A no-arg call
        // at runtime leaves the base (transient) registration in place — guard so
        // it is a no-op rather than mutating the registration to a scopeless copy.
        if (scope === undefined) {return;}
        applyScope(scope);
      },
    };
  }

  /**
   * Appends a scopeless producer base registration and returns the `.as(scope?)`
   * continuation. `.as()` REPLACES that base with a SCOPED copy in place (so the
   * chain remains one registration); a bare `.add(...)`/`.addFactory(...)` with
   * no trailing `.as()` leaves the base (transient) registration in place.
   */
  #appendScoped(token: Token, base: Registration): AddBuilder<Scopes> {
    this.#append(token, base);
    const list = this.#registrations.get(token)!;
    const index = list.length - 1;
    return this.#scopedContinuation((scope) => {
      list[index] = { ...base, scope };
    });
  }

  /**
   * Appends an OPEN class registration for a template token and returns the
   * `.as(scope?)` continuation — same scoped-copy semantics as `#appendScoped`,
   * against the open table. Enforces the v1 all-holes rule: every top-level
   * type argument of the service template must be exactly a hole (`$N`);
   * repeats (`IFoo<$<1>,$<1>>`) are allowed and constrain a match to equal args.
   */
  #appendOpenScoped(
    token: Token,
    ctor: Ctor,
    signatures: readonly (readonly DepSlot[])[] | undefined,
  ): AddBuilder<Scopes> {
    const parsed = parseToken(token);
    if (parsed === undefined || !parsed.args.every((arg) => HOLE_PATTERN.test(arg))) {
      throw new OpenTokenRegistrationError(token, "add");
    }
    const base: OpenRegistration = {
      template: token,
      base: parsed.base,
      pattern: parsed.args,
      ctor,
      scope: undefined,
      signatures,
    };
    this.#appendOpen(parsed.base, base);
    const list = this.#openRegistrations.get(parsed.base)!;
    const index = list.length - 1;
    return this.#scopedContinuation((scope) => {
      list[index] = { ...base, scope };
    });
  }

  /**
   * Class registration — a string token bound to a concrete constructor. The
   * runtime form: what the transformer emits for a class, and what a
   * plugin-less caller writes directly. Returns the `.as(scope?)` continuation.
   *
   * The optional third `signatures` param carries the dep signatures ON the
   * registration record — the sole signature channel now that the global
   * metadata store is retired. The transformer emits it inline for every
   * constructed class (`add(token, ctor, [[...]])`); a plugin-less caller
   * hand-feeds it directly. Keying signatures on the registration (not on the
   * ctor object) is what lets one JS class close differently per registration —
   * an open template and its closings never collide.
   *
   * An OPEN template token (`pkg:IRepo<$1>` — every type arg a hole) routes
   * into the open-registration table instead of the exact map; resolution
   * closes it per requested token. Mixing concrete args and holes in the
   * service token throws (v1 all-holes rule).
   */
  public add(
    token: Token,
    ctor: Ctor,
    signatures?: readonly (readonly DepSlot[])[],
  ): AddBuilder<Scopes>;
  public add(
    ...args:
      | [ctor: Ctor<any[], unknown>]
      | [ctor: Ctor<any[], unknown>, overrides: readonly (string | undefined)[]]
      | [factory: Func<any[], unknown>]
      | [token: Token, ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]]
  ): AddBuilder<Scopes> {
    // Only the string-token forms reach the engine at runtime. The single-arg
    // authoring overloads never run post-transform; guard defensively so a
    // hand-written type-form call fails loud rather than registering junk.
    if (args.length === 1 || typeof args[0] !== "string") {
      throw new TypeError(
        "add<I>(ctor) / add<I>(factory) require the @rhombus-std/di.transformer plugin. "
          + "Without it, register with an explicit token: add(\"my:token\", MyClass) "
          + "or addFactory(\"my:token\", (scope) => ...).",
      );
    }
    const [token, ctor, signatures] = args;
    if (isOpenToken(token)) {
      return this.#appendOpenScoped(token, ctor as Ctor, signatures);
    }
    // Wrap the ctor into a producer. `name`/`arity` are read off the ctor and
    // carried EXPLICITLY: the `(...a) => new Ctor(...a)` wrapper reports `""` for
    // `.name` and `0` for `.length`, so the missing-metadata signal and ctor-name
    // diagnostics would silently regress if read off the wrapper.
    const construct = ctor as Ctor;
    return this.#appendScoped(token, {
      produce: (...a: unknown[]) => new construct(...a),
      scope: undefined,
      signatures,
      name: construct.name,
      arity: construct.length,
    });
  }

  /**
   * Factory registration — a string token bound to a factory function. The
   * runtime form the transformer emits for an authored `add<I>(fn)` /
   * `addFactory<I>(fn)`, and what a plugin-less caller writes directly.
   *
   * Parameter injection follows the metadata rule (see `ServiceProvider`): each
   * parameter is injected by its slot from the registration-carried signatures
   * (the optional third arg, emitted inline by the transformer). A factory that
   * wants the live provider declares it as an ordinary parameter (a provider-typed
   * slot); a signature-less factory simply runs with no injected args — nothing is
   * auto-supplied. Returns the `.as(scope?)` continuation so a factory caches at a
   * named scope exactly like a class.
   *
   * The implementation signature admits the single-arg authoring form
   * (`addFactory<I>(fn)`) so the `@rhombus-std/di.transformer` overload merges onto it —
   * that form never runs post-transform, and the runtime guard below fails a
   * plugin-less call loud rather than registering junk (mirrors `add`).
   */
  public addFactory(
    token: Token,
    factory: Factory,
    signatures?: readonly (readonly DepSlot[])[],
  ): AddBuilder<Scopes>;
  public addFactory(
    ...args:
      | [factory: Func<any[], unknown>]
      | [token: Token, factory: Factory, signatures?: readonly (readonly DepSlot[])[]]
  ): AddBuilder<Scopes> {
    // Only the string-token form reaches the engine at runtime. The single-arg
    // `addFactory<I>(fn)` authoring overload never runs post-transform; guard
    // defensively so a hand-written type-form call fails loud.
    if (args.length === 1 || typeof args[0] !== "string") {
      throw new TypeError(
        "addFactory<I>(fn) requires the @rhombus-std/di.transformer plugin. Without it, "
          + "register with an explicit token: addFactory(\"my:token\", (scope) => ...).",
      );
    }
    const [token, factory, signatures] = args;
    // Open registrations are class-only: a template must synthesize per-closing
    // class registrations, which a factory/value shape cannot express in v1.
    if (isOpenToken(token)) {
      throw new OpenTokenRegistrationError(token, "addFactory");
    }
    // The factory IS the producer. `arity` is 0 so a signature-less factory runs
    // with no injected args (it never trips the missing-metadata signal — only a
    // ctor needing args does).
    return this.#appendScoped(token, {
      produce: factory,
      scope: undefined,
      signatures,
      name: factory.name,
      arity: 0,
    });
  }

  /**
   * Value registration — an already-built instance, no deps and no lifetime.
   * Separate from `add` because a value may itself be a function (a callable
   * service), which is structurally indistinguishable from a factory inside one
   * overload. The authoring form `addValue<I>(v)` (which lowers to
   * `addValue("token", v)`) is a PURE TYPING contributed by the
   * `@rhombus-std/di.transformer` augmentation, not part of di's published surface.
   */
  public addValue(token: Token, value: unknown): void;
  public addValue(
    ...args: [value: unknown] | [token: Token, value: unknown]
  ): void {
    if (args.length === 1 || typeof args[0] !== "string") {
      throw new TypeError(
        "addValue<I>(value) requires the @rhombus-std/di.transformer plugin. Without it, "
          + "register with an explicit token: addValue(\"my:token\", value).",
      );
    }
    const [token, value] = args;
    if (isOpenToken(token)) {
      throw new OpenTokenRegistrationError(token, "addValue");
    }
    // The value collapses to a producer that returns it verbatim. `scope` stays
    // `undefined` (a value is always transient — no ownership/caching), so a
    // value that is itself a `Promise` is returned raw through the normal path,
    // never awaited (§"Async as values").
    this.#append(token, {
      produce: () => value,
      scope: undefined,
      name: "",
      arity: 0,
    });
  }

  /**
   * Seals the collection into an immutable snapshot — the SEALING half of
   * `build()`. Deep-freezing the maps and each per-token list ensures that any
   * `.add()` call on the builder after sealing cannot mutate what the provider
   * and its descendants see — the container's view is fixed at build time.
   *
   * This is the collection's own concern, so it lives here in di.core. The
   * ENGINE-CONSTRUCTING half — turning this snapshot into a `ServiceProvider` —
   * is a `@rhombus-std/di` extension (`build()` below), because it needs the
   * runtime resolution engine di.core deliberately does not depend on.
   */
  public seal(): SealedManifest {
    // Deep-copy the registrations so post-seal builder mutations can't affect
    // the sealed map. Each per-token list is frozen independently.
    const registrations = new Map<Token, readonly Registration[]>();
    for (const [token, list] of this.#registrations) {
      registrations.set(token, Object.freeze([...list]));
    }
    Object.freeze(registrations);

    // The open table is sealed the same way. (The engine adds its own MUTABLE
    // closed-registration memo separately — synthesized closings land there,
    // never in these sealed maps.)
    const openRegistrations = new Map<Token, readonly OpenRegistration[]>();
    for (const [base, list] of this.#openRegistrations) {
      openRegistrations.set(base, Object.freeze([...list]));
    }
    Object.freeze(openRegistrations);

    return { registrations, openRegistrations };
  }

  /**
   * Seals the collection and returns the built `ServiceProvider`.
   *
   * The IMPLEMENTATION lives in `@rhombus-std/di`, not here — mirroring the
   * reference DI split where the collection ships in the abstractions package
   * but the provider-building entry is a runtime-package extension. Importing
   * `@rhombus-std/di` PROTOTYPE-PATCHES this method onto `ServiceManifestClass`
   * at load time (`services.seal()` → `new ServiceProviderClass(...)`), exactly
   * how a cross-package fluent-authoring augmentation patches the concrete
   * builder. The stub below is what runs if the runtime was never imported.
   *
   * NO frame is pre-opened: the returned provider is frameless. There is no
   * root scope — resolving a tagged registration with no matching frame open
   * yields a transient instance, and an untagged registration is transient as
   * always. Open a scope explicitly with `createScope(name)` when you want a
   * tagged registration to cache.
   */
  public build(): ServiceProvider<Scopes> {
    throw new TypeError(
      "ServiceManifest.build() requires the @rhombus-std/di runtime. Import "
        + "@rhombus-std/di (which constructs the resolution engine) before "
        + "calling build() — di.core ships only the registration collection.",
    );
  }
}

/**
 * The public registration-builder INTERFACE a di consumer holds — the
 * `ServiceManifestBase` interface bound to the concrete provider `build()`
 * returns (the ME `IServiceCollection` analog). Interface-first (not the impl
 * class) so the `@rhombus-std/di.transformer` augmentation — which merges the
 * authored `add<I>()` / `.as<"scope">()` forms onto `ServiceManifestBase` —
 * surfaces on a consumer typing against `ServiceManifest<S>`. A class would not
 * inherit those augmented overloads; the interface does.
 *
 * The constructor side (`ServiceManifestCtor`) and the constructible
 * `ServiceManifest` VALUE live in `@rhombus-std/di`, alongside the `build()`
 * prototype-patch that makes `new ServiceManifest().build()` produce a provider.
 */
export type ServiceManifest<S extends string = "singleton"> = ServiceManifestBase<
  S,
  ServiceProvider<S>
>;

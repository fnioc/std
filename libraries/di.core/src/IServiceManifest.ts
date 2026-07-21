// The registration builder. Holds the base token → registration list map and
// builds the IServiceProvider. Three registration surfaces:
//   - `add`        — a class (its ctor deps are injected),
//   - `addFactory` — a factory function (its call-param deps are injected),
//   - `addValue`   — an already-built instance (no deps, no lifetime).
// The transformer lowers the type-driven authoring forms (`add<I>(C)`,
// `add<I>(fn)`, `addValue<I>(v)`) to these; the explicit-token forms are the
// plugin-less mechanism for overrides, test doubles, and third-party wiring.
// `add<I>(fn)` (a factory) lowers to `addFactory("token", fn)` — the transformer
// statically knows the arg is a function, so the runtime never has to guess
// class-vs-factory.

import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import type { AddBuilder, IServiceManifestBase } from './authoring.js';
import { OpenTokenRegistrationError } from './errors.js';
import type { IServiceProvider } from './provider.js';
import type { Ctor, Factory, OpenRegistration, Registration, SealedManifest } from './registrations.js';
import type { ServiceProviderOptions } from './ServiceProviderOptions.js';
import { baseKey, tryParse } from './token.js';
import { HOLE_PATTERN, isOpenToken, parseToken } from './tokens.js';
import type { DepSlot, Token } from './types.js';

// The authoring TYPE-machinery — `AddBuilder` and the collection interface
// `IServiceManifestBase` — lives alongside this builder in the abstractions
// package `@rhombus-std/di.core`. The runtime `ServiceManifestClass` implements
// the interface; the engine-constructing half of `build()` is a
// `@rhombus-std/di` extension (see `build()` below).

/**
 * One ordered registration in the builder's single source of truth. An `exact`
 * entry binds a closed token to a producer `Registration`; an `open` entry binds
 * a template's base to an `OpenRegistration`. The list is materialised into the
 * two frozen lookup indexes only at `seal()` (toArray-at-seal), so a `.as(scope)`
 * continuation can replace its own entry's record IN PLACE — keeping one
 * `.add(...).as(...)` chain exactly one registration (a spurious transient shadow
 * would pollute collection aggregation).
 */
type ManifestEntry =
  | { readonly kind: 'exact'; readonly token: Token; registration: Registration; }
  | { readonly kind: 'open'; readonly base: Token; open: OpenRegistration; };

/** Appends `value` to the list at `key`, creating it on first use — the per-key
 * bucketing `seal()` uses to derive a frozen index from the ordered entries. */
function bucket<V>(index: Map<Token, V[]>, key: Token, value: V): void {
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, [value]);
  } else {
    existing.push(value);
  }
}

/**
 * The separator between a base token and a keyed registration's key. A keyed
 * registration lives under the ORDINARY token `base + "#" + key` — service
 * identity is already a token string and a key is just a `"#<key>"` suffix on it,
 * so keyed registration needs no separate table. It mirrors the resolve-side
 * separator in `@rhombus-std/di` (`resolve(token, key)` composes `key === "" ?
 * token : token + "#" + key`), so a keyed register and a keyed resolve agree.
 */
const KEY_SEPARATOR = '#';

/**
 * Composes the effective registration token from a base token and an OPTIONAL
 * tail key. A falsy key — `undefined` (the omitted tail argument) or the empty
 * string — is unkeyed and leaves the token unchanged, so a plugin-less
 * 3-argument call and a transformer-lowered UNKEYED call both register under the
 * bare token exactly as before. A non-empty key suffixes `#<key>`, landing on the
 * same string the transformer's di direct stage composes into arg0 for
 * `add<Keyed<T, K>>(Impl)` — inline (base + key) and direct (composed) agree.
 */
function keyedToken(token: Token, key?: string): Token {
  return [token, key].filter(Boolean).join(KEY_SEPARATOR);
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
 *
 * `@augment` marks it as the concrete receiver for the OPEN `ServiceManifest`
 * augmentation token: every cross-package registration augmentation (`build`,
 * `addOptions`, `addLogging`, `addMetrics`, `addMemoryCache`,
 * `addHostedService`, `removeAll`, ...) registers its set against
 * `nameof<IServiceManifest>()`, and the decorator subscribes the class
 * so each set — including those registered by DOWNSTREAM packages loaded after
 * this one — is (re)installed onto the prototype (docs/decisions.md §38).
 */
@augment(nameof<IServiceManifest>())
export class ServiceManifestClass<Scopes extends string = 'singleton'>
  implements IServiceManifestBase<Scopes, IServiceProvider<Scopes>>
{
  /**
   * The single ordered source of truth: every registration in registration
   * order, `exact` and `open` interleaved. Resolution picks the most-recent
   * (last) registration of a token; earlier ones are retained (collection
   * aggregation enumerates them all, which is what lets a later `.add()` override
   * an earlier one for bare-T resolution without deletion). `seal()` derives the
   * two frozen lookup indexes from this list (toArray-at-seal), reproducing
   * first-occurrence map order and per-token list order. Reassigned (filtered)
   * by `removeRegistrations`.
   */
  #entries: ManifestEntry[] = [];

  public constructor() {}

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
  #scopedContinuation(applyScope: Func<[scope: Scopes], void>): AddBuilder<Scopes> {
    return {
      as<S extends Scopes>(scope?: S): void {
        // The lowered form always passes a value arg; the authored type-arg-only
        // form never executes (the transformer rewrites it first). A no-arg call
        // at runtime leaves the base (transient) registration in place — guard so
        // it is a no-op rather than mutating the registration to a scopeless copy.
        if (scope === undefined) {
          return;
        }
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
    const entry: ManifestEntry = { kind: 'exact', token, registration: base };
    this.#entries.push(entry);
    return this.#scopedContinuation((scope) => {
      entry.registration = { ...base, scope };
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
    signatures: ReadonlyArray<readonly DepSlot[]> | undefined,
  ): AddBuilder<Scopes> {
    const parsed = parseToken(token);
    if (parsed === undefined || !parsed.args.every((arg) => HOLE_PATTERN.test(arg))) {
      throw new OpenTokenRegistrationError(token, 'add');
    }
    // The parsed template tree the engine unifies against (`match`). The
    // string-grammar `parseToken`/`HOLE_PATTERN` above stays the all-holes
    // classification guard; `tryParse` never throws — an all-holes template that
    // passed the guard always parses.
    const node = tryParse(token);
    // Key the open table by the SAME canonical `baseKey` the engine looks it up
    // by (`baseKey(ground)` in `ServiceProviderClass.#lookup`). Deriving the key
    // from the typed node — not the raw `parseToken` base — keeps registration
    // and lookup on one canonicalisation: for every canonical template the two
    // agree (`pkg:IRepo`), and a non-canonical base spelling (`t:IR <$1>`) now
    // registers under the same stripped key its ground spelling resolves to,
    // instead of a raw space-bearing key the canonical lookup could never find.
    const openBase = node !== undefined ? baseKey(node) : parsed.base;
    const open: OpenRegistration = {
      template: token,
      base: openBase,
      pattern: parsed.args,
      ctor,
      scope: undefined,
      signatures,
      node,
    };
    const entry: ManifestEntry = { kind: 'open', base: openBase, open };
    this.#entries.push(entry);
    return this.#scopedContinuation((scope) => {
      entry.open = { ...open, scope };
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
    signatures?: ReadonlyArray<readonly DepSlot[]>,
    key?: string,
  ): AddBuilder<Scopes>;
  public add(
    ...args:
      | [ctor: Ctor<any[], unknown>]
      | [ctor: Ctor<any[], unknown>, overrides: ReadonlyArray<string | undefined>]
      | [factory: Func<any[], unknown>]
      | [token: Token, ctor: Ctor, signatures?: ReadonlyArray<readonly DepSlot[]>, key?: string]
  ): AddBuilder<Scopes> {
    // Only the string-token forms reach the engine at runtime. The single-arg
    // authoring overloads never run post-transform; guard defensively so a
    // hand-written type-form call fails loud rather than registering junk.
    if (args.length === 1 || typeof args[0] !== 'string') {
      throw new TypeError(
        'add<I>(ctor) / add<I>(factory) require the @rhombus-std/di.transformer plugin. '
          + 'Without it, register with an explicit token: add("my:token", MyClass) '
          + 'or addFactory("my:token", (scope) => ...).',
      );
    }
    // The optional trailing `key` composes the keyed token `base#key` (§98); a
    // falsy/omitted key leaves the token bare, so the 3-argument call is unchanged.
    const [token, ctor, signatures, key] = args;
    const composed = keyedToken(token, key);
    if (isOpenToken(composed)) {
      return this.#appendOpenScoped(composed, ctor as Ctor, signatures);
    }
    // Wrap the ctor into a producer. `name`/`arity` are read off the ctor and
    // carried EXPLICITLY: the `(...a) => new Ctor(...a)` wrapper reports `""` for
    // `.name` and `0` for `.length`, so the missing-metadata signal and ctor-name
    // diagnostics would silently regress if read off the wrapper.
    const construct = ctor as Ctor;
    return this.#appendScoped(composed, {
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
   * Parameter injection follows the metadata rule (see `IServiceProvider`): each
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
    signatures?: ReadonlyArray<readonly DepSlot[]>,
    key?: string,
  ): AddBuilder<Scopes>;
  public addFactory(
    ...args:
      | [factory: Func<any[], unknown>]
      | [token: Token, factory: Factory, signatures?: ReadonlyArray<readonly DepSlot[]>, key?: string]
  ): AddBuilder<Scopes> {
    // Only the string-token form reaches the engine at runtime. The single-arg
    // `addFactory<I>(fn)` authoring overload never runs post-transform; guard
    // defensively so a hand-written type-form call fails loud.
    if (args.length === 1 || typeof args[0] !== 'string') {
      throw new TypeError(
        'addFactory<I>(fn) requires the @rhombus-std/di.transformer plugin. Without it, '
          + 'register with an explicit token: addFactory("my:token", (scope) => ...).',
      );
    }
    // The optional trailing `key` composes the keyed token `base#key` (§98).
    const [token, factory, signatures, key] = args;
    const composed = keyedToken(token, key);
    // Open registrations are class-only: a template must synthesize per-closing
    // class registrations, which a factory/value shape cannot express in v1.
    if (isOpenToken(composed)) {
      throw new OpenTokenRegistrationError(composed, 'addFactory');
    }
    // The factory IS the producer. `arity` is 0 so a signature-less factory runs
    // with no injected args (it never trips the missing-metadata signal — only a
    // ctor needing args does).
    return this.#appendScoped(composed, {
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
  public addValue(token: Token, value: unknown, key?: string): void;
  public addValue(
    ...args: [value: unknown] | [token: Token, value: unknown, key?: string]
  ): void {
    if (args.length === 1 || typeof args[0] !== 'string') {
      throw new TypeError(
        'addValue<I>(value) requires the @rhombus-std/di.transformer plugin. Without it, '
          + 'register with an explicit token: addValue("my:token", value).',
      );
    }
    // The optional trailing `key` composes the keyed token `base#key` (§98).
    const [token, value, key] = args;
    const composed = keyedToken(token, key);
    if (isOpenToken(composed)) {
      throw new OpenTokenRegistrationError(composed, 'addValue');
    }
    // The value collapses to a producer that returns it verbatim. `scope` stays
    // `undefined` (a value is always transient — no ownership/caching), so a
    // value that is itself a `Promise` is returned raw through the normal path,
    // never awaited (§"Async as values").
    this.#entries.push({
      kind: 'exact',
      token: composed,
      registration: {
        produce: () => value,
        scope: undefined,
        name: '',
        arity: 0,
      },
    });
  }

  /**
   * Removes EVERY registration bound to `token` — both the exact-map list and
   * the open-template list keyed by that base. The removal PRIMITIVE behind the
   * `ServiceCollectionDescriptorExtensions.removeAll` augmentation
   * (`service-collection-descriptor-augmentations.ts`), which cannot reach these
   * private tables from a separate module. Not part of the public authoring
   * interface (`IServiceManifestBase`) — a consumer reaches the mutation through
   * the fluent `removeAll` augmentation, exactly as `build()` is reached through
   * the di runtime, never as a raw method on the collection surface.
   */
  public removeRegistrations(token: Token): void {
    // The literal double-delete: drop every exact entry under `token` AND every
    // open entry whose BASE is `token` — the old `#registrations.delete(token)`
    // + `#openRegistrations.delete(token)`, keyed identically.
    this.#entries = this.#entries.filter((entry) =>
      entry.kind === 'exact' ? entry.token !== token : entry.base !== token
    );
  }

  /**
   * True when `token` already has at least one registration — an exact-map entry,
   * or (for an open template token) a matching template in the open table. The
   * "already registered?" PRIMITIVE behind the `tryAdd*` augmentations
   * (`ServiceCollectionDescriptorExtensions`), which cannot reach these private
   * tables from a separate module. Like `removeRegistrations`, it is not part of
   * the public authoring interface (`IServiceManifestBase`): a consumer reaches
   * the conditional-add behavior through the fluent `tryAdd`/`replace`
   * augmentations, never as a raw method on the collection surface.
   *
   * The token is our service-type key (the reference `TryAdd` dedups by
   * `ServiceType`). Matching is exact — an open template dedups against the same
   * template string, never against a closing it could synthesize.
   */
  public hasRegistrations(token: Token): boolean {
    if (this.#entries.some((entry) => entry.kind === 'exact' && entry.token === token)) {
      return true;
    }
    // An open template dedups against the same template STRING only (never a
    // closing it could synthesize). Classification stays on the string predicate;
    // the `parseToken !== undefined` guard reproduces the old behavior (a bare
    // hole is open but unparseable, so it dedups against nothing).
    if (isOpenToken(token) && parseToken(token) !== undefined) {
      return this.#entries.some((entry) => entry.kind === 'open' && entry.open.template === token);
    }
    return false;
  }

  /**
   * Seals the collection into an immutable snapshot — the SEALING half of
   * `build()`. Deep-freezing the maps and each per-token list ensures that any
   * `.add()` call on the builder after sealing cannot mutate what the provider
   * and its descendants see — the container's view is fixed at build time.
   *
   * This is the collection's own concern, so it lives here in di.core. The
   * ENGINE-CONSTRUCTING half — turning this snapshot into a `IServiceProvider` —
   * is a `@rhombus-std/di` extension (`build()` below), because it needs the
   * runtime resolution engine di.core deliberately does not depend on.
   */
  public seal(): SealedManifest {
    // toArray-at-seal: materialise the ordered entry list into the two frozen
    // lookup indexes. First-occurrence bucketing reproduces the old Map insertion
    // order (exact keyed by token, open keyed by parsed base) and each per-key
    // list keeps registration order — so #resolveKeyed's iteration order and the
    // last-wins semantics stay byte-identical. Fresh arrays (not aliasing
    // #entries) + deep-freeze mean a post-seal `.add()` can't mutate the snapshot.
    // (The engine adds its own MUTABLE closed-registration memo separately —
    // synthesized closings land there, never in these sealed maps.)
    const registrations = new Map<Token, Registration[]>();
    const openRegistrations = new Map<Token, OpenRegistration[]>();
    for (const entry of this.#entries) {
      if (entry.kind === 'exact') {
        bucket(registrations, entry.token, entry.registration);
      } else {
        bucket(openRegistrations, entry.base, entry.open);
      }
    }
    for (const list of registrations.values()) {
      Object.freeze(list);
    }
    for (const list of openRegistrations.values()) {
      Object.freeze(list);
    }
    Object.freeze(registrations);
    Object.freeze(openRegistrations);

    return { registrations, openRegistrations };
  }

  /**
   * Seals the collection and returns the built `IServiceProvider`.
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
   *
   * `options` configures the provider's validation behaviors
   * (`validateScopes` / `validateOnBuild`); see `ServiceProviderOptions`.
   */
  public build(_options?: ServiceProviderOptions): IServiceProvider<Scopes> {
    throw new TypeError(
      'ServiceManifest.build() requires the @rhombus-std/di runtime. Import '
        + '@rhombus-std/di (which constructs the resolution engine) before '
        + 'calling build() — di.core ships only the registration collection.',
    );
  }
}

/**
 * The public registration-builder INTERFACE a di consumer holds — the
 * `IServiceManifestBase` interface bound to the concrete provider `build()`
 * returns (the ME `IServiceCollection` analog). Interface-first (not the impl
 * class) so the `@rhombus-std/di.transformer` augmentation — which merges the
 * authored `add<I>()` / `.as<"scope">()` forms onto `IServiceManifestBase` —
 * surfaces on a consumer typing against `ServiceManifest<S>`. A class would not
 * inherit those augmented overloads; the interface does.
 *
 * The constructor side (`ServiceManifestCtor`) and the constructible
 * `ServiceManifest` VALUE live in `@rhombus-std/di`, alongside the `build()`
 * prototype-patch that makes `new ServiceManifest().build()` produce a provider.
 */
export type IServiceManifest<S extends string = 'singleton'> = IServiceManifestBase<
  S,
  IServiceProvider<S>
>;

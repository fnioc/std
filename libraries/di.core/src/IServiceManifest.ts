// The registration builder — an IMMUTABLE, ITERABLE DECORATOR CHAIN. Three
// explicit registration verbs, one per producer kind — no ambiguous `add`:
//   - `addClass`   — a class (its ctor deps are injected),
//   - `addFactory` — a factory function (its call-param deps are injected),
//   - `addValue`   — an already-built instance (no deps, no lifetime).
// The transformer lowers the type-driven authoring forms (`addClass<I>(C)`,
// `addFactory<I>(fn)`, `addValue<I>(v)`) to these; the explicit-token forms are
// the plugin-less mechanism for overrides, test doubles, and third-party wiring.
// The verb NAME (not arg inspection) discriminates class from factory — both are
// functions, so `addClass` and `addFactory` are separate methods rather than one
// method guessing.
//
// THE SHAPE: a manifest is a linked list of frozen nodes, not a container of a
// mutable array. The root holds an empty inner iterable; every registration
// wraps the manifest it was called on in a NEW node carrying exactly ONE entry.
// Iteration yields `inner` FIRST and the node's own entry LAST, so the entry
// stream comes out in authoring order — the order `seal()` buckets by, and
// therefore the order last-wins resolution and collection aggregation see. THAT
// ORDER IS LOAD-BEARING.
//
// NOTHING MUTATES. `addClass`/`addFactory`/`addValue` and each fluent modifier
// return a NEW manifest; the receiver is untouched. A call whose result is
// discarded registers nothing:
//
//   let services = new ServiceManifest();
//   services = services.addClass("pkg:ILogger", ConsoleLogger, [[]], "singleton");
//   services.addClass("pkg:IClock", SystemClock, [[]]);  // ← LOST: result discarded
//   const provider = services.build();

import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

import type { AddChain, IServiceManifestBase } from './authoring.js';
import { OpenTokenRegistrationError } from './errors.js';
import type { IServiceProvider } from './provider.js';
import type { Ctor, Factory, ManifestEntry, OpenRegistration, Registration, SealedManifest } from './registrations.js';
import type { ServiceProviderOptions } from './ServiceProviderOptions.js';
import { HOLE_PATTERN, isOpenToken, parseToken } from './token/index.js';
import { TokenNode } from './token/index.js';
import type { DepSignatures, DepSlot, Token } from './types.js';

// The authoring TYPE-machinery — the `AddChain` slot algebra and the collection
// interface `IServiceManifestBase` — lives alongside this builder in the
// abstractions package `@rhombus-std/di.core`. The runtime `ServiceManifestClass`
// implements the interface; the engine-constructing half of `build()` is a
// `@rhombus-std/di` extension (see `build()` below).

/** Compile-time exhaustiveness guard for a discriminated union switch. */
function assertNever(value: never): never {
  throw new TypeError(`Unhandled variant: ${JSON.stringify(value)}`);
}

/** The root node's inner iterable — a shared frozen empty list. */
const EMPTY_ENTRIES: readonly ManifestEntry[] = Object.freeze([]);

/** Appends `value` to the list at `key`, creating it on first use — the per-key
 * bucketing `seal()` uses to derive a frozen index from the entry stream. */
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
 * string — is unkeyed and leaves the token unchanged, so a plugin-less unkeyed
 * call and a transformer-lowered UNKEYED call both register under the bare token
 * exactly as before. A non-empty key suffixes `#<key>`, landing on the same
 * string the transformer's di direct stage composes into arg0 for
 * `addClass<Keyed<T, K>>(Impl)` — inline (base + key) and direct (composed) agree.
 */
function keyedToken(token: Token, key?: string): Token {
  return [token, key].filter(Boolean).join(KEY_SEPARATOR);
}

/**
 * What a registration call captured, BEFORE it was classified into a
 * `ManifestEntry`. The chain node keeps this alongside the materialised entry so
 * a fluent modifier can refine ONE facet — the scope, the key, the signatures —
 * and re-materialise from the same authored inputs. The BASE token is retained
 * separately from the composed one precisely because `withKey` has to recompose
 * `base#key` from scratch rather than suffix an already-keyed token.
 */
interface PendingRegistration {
  readonly producer: PendingProducer;
  /** The token AS AUTHORED, before any key suffix. */
  readonly base: Token;
  readonly key: string | undefined;
  readonly signatures: DepSignatures | undefined;
  /** The owning lifetime tag. `undefined` is transient — the absence of a scope. */
  readonly scope: string | undefined;
}

/**
 * The authored producer, still in its original kind. The kind survives every
 * refinement, so the error a recomposed token raises names the ORIGINATING verb
 * (`add` / `addFactory` / `addValue`) exactly as the first call would have.
 */
type PendingProducer =
  | { readonly kind: 'class'; readonly ctor: Ctor; }
  | { readonly kind: 'factory'; readonly factory: Factory; }
  | { readonly kind: 'value'; readonly value: unknown; };

/**
 * Classifies a captured registration into the frozen `ManifestEntry` a chain node
 * yields. This is where the registration-time errors live, and it runs from the
 * chain node's CONSTRUCTOR — so `add`/`addFactory`/`addValue` and the modifiers
 * that recompose the token all throw AT THE CALL, never deferred to `seal()`.
 */
function materialise(pending: PendingRegistration): ManifestEntry {
  const token = keyedToken(pending.base, pending.key);
  // NOTE: `blowUpSignatures` (docs TODO §0 — cartesian union-to-overloads at
  // registration) is NOT wired here yet, deliberately. It stays exported for the
  // later PR that deletes the engine's per-param union resolution. That deletion
  // is the precondition for blowing up: per-param `#resolveUnion` falls through on
  // a member's RUNTIME failure (a ctor that throws at build, a Promise that
  // rejects — union.test's GAP2 / async-reject pins), whereas blown static
  // overloads select purely on registration-presence and cannot express that
  // fall-through. While per-param resolution is retained, the signatures must
  // reach the engine union-bearing, so materialise threads them through untouched.
  const signatures = pending.signatures;
  const producer = pending.producer;
  switch (producer.kind) {
    case 'class': {
      // An OPEN template token (`pkg:IRepo<$1>` — every type arg a hole) routes
      // into the open-registration table instead of the exact map; resolution
      // closes it per requested token.
      if (isOpenToken(token)) {
        return openEntry(token, producer.ctor, signatures, pending.scope);
      }
      // Wrap the ctor into a producer. `name`/`arity` are read off the ctor and
      // carried EXPLICITLY: the `(...a) => new Ctor(...a)` wrapper reports `""`
      // for `.name` and `0` for `.length`, so the missing-metadata signal and
      // ctor-name diagnostics would silently regress if read off the wrapper.
      const construct = producer.ctor;
      const registration: Registration = {
        produce: (...a: unknown[]) => new construct(...a),
        scope: pending.scope,
        signatures,
        name: construct.name,
        arity: construct.length,
      };
      return Object.freeze({ kind: 'exact', token, registration } satisfies ManifestEntry);
    }
    case 'factory': {
      // Open registrations are class-only: a template must synthesize per-closing
      // class registrations, which a factory/value shape cannot express in v1.
      if (isOpenToken(token)) {
        throw new OpenTokenRegistrationError(token, 'addFactory');
      }
      // The factory IS the producer. `arity` is the factory's OWN declared
      // parameter count (`factory.length`): a signatures-driven factory that
      // declares parameters but is registered with `[[]]` should trip the
      // missing-metadata signal, not silently run with no injected args.
      const registration: Registration = {
        produce: producer.factory,
        scope: pending.scope,
        signatures,
        name: producer.factory.name,
        arity: producer.factory.length,
      };
      return Object.freeze({ kind: 'exact', token, registration } satisfies ManifestEntry);
    }
    case 'value': {
      if (isOpenToken(token)) {
        throw new OpenTokenRegistrationError(token, 'addValue');
      }
      // The value collapses to a producer that returns it verbatim. `scope` stays
      // `undefined` (a value is always transient — no ownership/caching), so a
      // value that is itself a `Promise` is returned raw through the normal path,
      // never awaited (§"Async as values").
      const value = producer.value;
      const registration: Registration = {
        produce: () => value,
        scope: undefined,
        name: '',
        arity: 0,
      };
      return Object.freeze({ kind: 'exact', token, registration } satisfies ManifestEntry);
    }
    default: {
      return assertNever(producer);
    }
  }
}

/**
 * Builds the OPEN entry for a class registration whose token is a template.
 * Enforces the v1 all-holes rule: every top-level type argument of the service
 * template must be exactly a hole (`$N`); repeats (`IFoo<$<1>,$<1>>`) are allowed
 * and constrain a match to equal args.
 */
function openEntry(
  token: Token,
  ctor: Ctor,
  signatures: DepSignatures | undefined,
  scope: string | undefined,
): ManifestEntry {
  const parsed = parseToken(token);
  if (parsed === undefined || !parsed.args.every((arg) => HOLE_PATTERN.test(arg))) {
    throw new OpenTokenRegistrationError(token, 'add');
  }
  // The parsed template tree the engine unifies against (`match`). The
  // string-grammar `parseToken`/`HOLE_PATTERN` above stays the all-holes
  // classification guard; `TokenNode.tryParse` never throws — an all-holes
  // template that passed the guard always parses.
  const node = TokenNode.tryParse(token);
  // Key the open table by the SAME canonical `baseKey` the engine looks it up
  // by (`TokenNode.baseKey(ground)` in `ServiceProviderClass.#lookup`). Deriving
  // the key from the typed node — not the raw `parseToken` base — keeps
  // registration and lookup on one canonicalisation: for every canonical template
  // the two agree (`pkg:IRepo`), and a non-canonical base spelling (`t:IR <$1>`)
  // now registers under the same stripped key its ground spelling resolves to,
  // instead of a raw space-bearing key the canonical lookup could never find.
  const base = node !== undefined ? TokenNode.baseKey(node) : parsed.base;
  const open: OpenRegistration = {
    template: token,
    base,
    pattern: parsed.args,
    ctor,
    scope,
    signatures,
    node,
  };
  return Object.freeze({ kind: 'open', base, open } satisfies ManifestEntry);
}

/**
 * The registration builder — the ROOT node of the immutable chain.
 *
 * `Scopes` is the union of declarable scope names — the tags `.as()` and
 * `.createScope()` accept (default `"singleton"`). There is no root scope: scopes
 * are uniform tags, and `"singleton"` is just a tag you happen to open once at
 * the top. `"transient"` is NOT a member — transient is the absence of a scope,
 * not a scope. A registration whose tagged scope is not open at resolution time
 * resolves transiently (fresh instance, no cache).
 *
 * Every instance is FROZEN and holds only its inner iterable, so a manifest can
 * be shared, forked, and re-registered from freely: two branches off one manifest
 * never see each other's registrations.
 *
 * @example
 * ```ts
 * let services = new ServiceManifest<"singleton" | "request">();
 * services = services.addClass("pkg:ILogger", ConsoleLogger, [[]], "singleton");
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
 * di.core interfaces, never onto this class directly) — freezing INSTANCES does
 * not close the PROTOTYPE, so the augmentation install path is unaffected.
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
   * The entries this node decorates — its PREDECESSOR in the chain. Empty at the
   * root. `protected __`-prefixed (never `#`) because the one subclass below has
   * to read it to build a sibling node over the same predecessor; `protected` is
   * erased in emit, so the `__` prefix is the runtime "internal" signal.
   */
  protected readonly __inner: Iterable<ManifestEntry>;

  /**
   * `inner` is INTERNAL — the chain link. Public consumers construct a root with
   * `new ServiceManifest()`; the parameter exists so a chain node can hand its
   * predecessor down, and so `removeRegistrations` can rebase onto a filtered
   * entry list.
   */
  public constructor(inner: Iterable<ManifestEntry> = EMPTY_ENTRIES) {
    this.__inner = inner;
    // Freeze the ROOT here; a subclass freezes itself once its own fields are
    // installed (freezing in the base would block the subclass's assignments).
    if (new.target === ServiceManifestClass) {
      Object.freeze(this);
    }
  }

  /**
   * The entry stream — registration order out. The root yields only what it
   * decorates; `AddBuilderManifest` overrides this to append its own entry LAST,
   * which is what makes iteration order equal authoring order.
   */
  public *[Symbol.iterator](): IterableIterator<ManifestEntry> {
    yield* this.__inner;
  }

  /**
   * Wraps this manifest in a new chain node carrying `pending`. Materialisation
   * (and therefore every registration-time error) happens inside the node's
   * constructor, so a rejected registration throws from the call that made it and
   * no half-built node escapes.
   */
  #link(pending: PendingRegistration): AddBuilderManifest<Scopes> {
    return new AddBuilderManifest<Scopes>(this, pending);
  }

  /**
   * Class registration — a string token bound to a concrete constructor. The
   * runtime form: what the transformer emits for a class, and what a
   * plugin-less caller writes directly.
   *
   * `signatures` carries the dep signatures ON the registration record — the sole
   * signature channel now that the global metadata store is retired. Passing it
   * POSITIONALLY (the 3+-arg overloads) starts the chain ungated. Passing it via
   * the transformer inline (`addClass(token, ctor, [[...]])`) is the same. The
   * bare 2-arg form `addClass(token, ctor)` supplies NO signature: it is GATED —
   * the returned chain withholds the manifest face until `withSignature` /
   * `withSignatures` supplies one (a plugin-less caller states `[[]]` for a ctor
   * with no dependencies, either positionally or via `withSignature()`). Keying
   * signatures on the registration (not on the ctor object) is what lets one JS
   * class close differently per registration — an open template and its closings
   * never collide.
   *
   * `scope` and `key` are the positional forms of the `.as()` / `.withKey()`
   * modifiers; whichever are omitted stay reachable on the returned chain.
   *
   * An OPEN template token (`pkg:IRepo<$1>` — every type arg a hole) routes into
   * the open-registration table instead of the exact map; resolution closes it
   * per requested token. Mixing concrete args and holes in the service token
   * throws (v1 all-holes rule).
   *
   * Returns a NEW manifest — this one is unchanged.
   */
  public addClass(
    token: Token,
    ctor: Ctor,
  ): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', true>;
  public addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
  ): AddChain<Scopes, 'signature' | 'scope' | 'key', true>;
  public addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope: Scopes,
  ): AddChain<Scopes, 'signature' | 'key', true>;
  public addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope: Scopes,
    key: string,
  ): AddChain<Scopes, 'signature', true>;
  public addClass(...args: any[]): AddBuilderManifest<Scopes> {
    // Only the string-token forms reach the engine at runtime. The single-arg
    // `addClass<I>(ctor)` authoring overload never runs post-transform; guard
    // defensively so a hand-written type-form call fails loud rather than
    // registering junk. The 2-arg gated form (a real token, no signatures) is
    // legitimate — it passes the guard and links with `signatures: undefined`.
    if (args.length === 1 || typeof args[0] !== 'string') {
      throw new TypeError(
        'addClass<I>(ctor) requires the @rhombus-std/di.transformer plugin. '
          + 'Without it, register with an explicit token: addClass("my:token", MyClass, [[]]) '
          + 'or addFactory("my:token", (scope) => ..., [["pkg:IResolver"]]).',
      );
    }
    const [token, ctor, signatures, scope, key] = args;
    return this.#link({
      producer: { kind: 'class', ctor },
      base: token,
      key,
      signatures,
      scope,
    });
  }

  /**
   * Factory registration — a string token bound to a factory function. The
   * runtime form the transformer emits for an authored `addFactory<I>(fn)`, and
   * what a plugin-less caller writes directly.
   *
   * Parameter injection follows the metadata rule (see `IServiceProvider`): each
   * parameter is injected by its slot from the registration-carried `signatures`.
   * A factory that wants the live provider declares it as an ordinary parameter (a
   * provider-typed slot); a factory declaring `[[]]` simply runs with no injected
   * args — nothing is auto-supplied. `scope` / `key` behave exactly as on
   * `addClass`, so a factory caches at a named scope like a class. The bare 2-arg
   * form is GATED like `addClass`'s.
   *
   * Returns a NEW manifest — this one is unchanged.
   */
  public addFactory(
    token: Token,
    factory: Factory,
  ): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', true>;
  public addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
  ): AddChain<Scopes, 'signature' | 'scope' | 'key', true>;
  public addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: Scopes,
  ): AddChain<Scopes, 'signature' | 'key', true>;
  public addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: Scopes,
    key: string,
  ): AddChain<Scopes, 'signature', true>;
  public addFactory(...args: any[]): AddBuilderManifest<Scopes> {
    // Only the string-token form reaches the engine at runtime. The single-arg
    // `addFactory<I>(fn)` authoring overload never runs post-transform; guard
    // defensively so a hand-written type-form call fails loud. The 2-arg gated
    // form (a real token, no signatures) is legitimate.
    if (args.length === 1 || typeof args[0] !== 'string') {
      throw new TypeError(
        'addFactory<I>(fn) requires the @rhombus-std/di.transformer plugin. Without it, '
          + 'register with an explicit token: addFactory("my:token", (scope) => ..., [["pkg:IResolver"]]).',
      );
    }
    const [token, factory, signatures, scope, key] = args;
    return this.#link({
      producer: { kind: 'factory', factory },
      base: token,
      key,
      signatures,
      scope,
    });
  }

  /**
   * Value registration — an already-built instance, no deps and no lifetime.
   * Separate from `addClass` / `addFactory` because a value may itself be a
   * function (a callable service), which is structurally indistinguishable from a
   * factory inside one overload — the verb name is what disambiguates. It takes
   * neither `signatures` nor `scope`; the optional trailing `key` composes the
   * keyed token `base#key` (§98). The authoring form `addValue<I>(v)` (which
   * lowers to `addValue("token", v)`) is a PURE TYPING contributed by the
   * `@rhombus-std/di.transformer` augmentation, not part of di's published
   * surface.
   *
   * Returns a NEW manifest — this one is unchanged. There is no chain to
   * continue: a value has no slot left to fill.
   */
  public addValue(token: Token, value: unknown): IServiceManifest<Scopes>;
  public addValue(token: Token, value: unknown, key: string): IServiceManifest<Scopes>;
  public addValue(...args: any[]): IServiceManifest<Scopes> {
    if (args.length === 1 || typeof args[0] !== 'string') {
      throw new TypeError(
        'addValue<I>(value) requires the @rhombus-std/di.transformer plugin. Without it, '
          + 'register with an explicit token: addValue("my:token", value).',
      );
    }
    const [token, value, key] = args;
    return new AddBuilderManifest<Scopes>(this, {
      producer: { kind: 'value', value },
      base: token,
      key,
      signatures: undefined,
      scope: undefined,
    });
  }

  /**
   * Returns a manifest with EVERY registration bound to `token` dropped — both
   * the exact entries under that token AND the open entries whose canonical BASE
   * is that token. The removal PRIMITIVE behind the
   * `ServiceManifestDescriptorAugmentations.removeAll` augmentation, which cannot
   * reach this node's internals from a separate module. Not part of the public
   * authoring interface (`IServiceManifestBase`) — a consumer reaches removal
   * through the fluent `removeAll` augmentation, exactly as `build()` is reached
   * through the di runtime, never as a raw method on the collection surface.
   *
   * It REBASES rather than filters in place: the survivors become the inner list
   * of a fresh root, collapsing the chain walked so far into one frozen array.
   * The receiver still holds every registration it had — the caller must keep the
   * returned manifest.
   */
  public removeRegistrations(token: Token): IServiceManifest<Scopes> {
    const kept = [...this].filter((entry) => entry.kind === 'exact' ? entry.token !== token : entry.base !== token);
    return new ServiceManifestClass<Scopes>(Object.freeze(kept));
  }

  /**
   * True when `token` already has at least one registration — an exact entry, or
   * (for an open template token) a matching template among the open entries. The
   * "already registered?" PRIMITIVE behind the `tryAdd*` augmentations
   * (`ServiceManifestDescriptorAugmentations`), which cannot reach this node's
   * internals from a separate module. Like `removeRegistrations`, it is not part
   * of the public authoring interface (`IServiceManifestBase`): a consumer reaches
   * the conditional-add behavior through the fluent `tryAdd`/`replace`
   * augmentations, never as a raw method on the collection surface.
   *
   * The token is our service-type key (the reference `TryAdd` dedups by
   * `ServiceType`). Matching is exact — an open template dedups against the same
   * template string, never against a closing it could synthesize.
   */
  public hasRegistrations(token: Token): boolean {
    // An open template dedups against the same template STRING only (never a
    // closing it could synthesize). Classification stays on the string predicate;
    // the `parseToken !== undefined` guard reproduces the old behavior (a bare
    // hole is open but unparseable, so it dedups against nothing).
    const openQuery = isOpenToken(token) && parseToken(token) !== undefined;
    for (const entry of this) {
      if (entry.kind === 'exact') {
        if (entry.token === token) {
          return true;
        }
        continue;
      }
      if (openQuery && entry.open.template === token) {
        return true;
      }
    }
    return false;
  }

  /**
   * Seals the collection into an immutable snapshot — the SEALING half of
   * `build()`. It materialises by ITERATING this node (walking the chain from the
   * root forward), never by reading a stored array, and buckets the stream into
   * the two frozen lookup indexes: exact entries keyed by token, open entries by
   * canonical base. First-occurrence bucketing fixes map order and each per-key
   * list keeps registration order, so `#resolveKeyed`'s iteration order and the
   * last-wins semantics are exactly what the authoring order implies.
   *
   * Deep-freezing the maps and each per-token list means a provider's view is
   * fixed at build time. Nothing can invalidate it after the fact anyway — a
   * later `add()` returns a DIFFERENT manifest and leaves this chain untouched —
   * but the freeze keeps the snapshot honest against the engine, which adds its
   * own MUTABLE closed-registration memo separately (synthesized closings land
   * there, never in these sealed maps).
   *
   * This is the collection's own concern, so it lives here in di.core. The
   * ENGINE-CONSTRUCTING half — turning this snapshot into a `IServiceProvider` —
   * is a `@rhombus-std/di` extension (`build()` below), because it needs the
   * runtime resolution engine di.core deliberately does not depend on.
   */
  public seal(): SealedManifest {
    const registrations = new Map<Token, Registration[]>();
    const openRegistrations = new Map<Token, OpenRegistration[]>();
    for (const entry of this) {
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
 * A chain node carrying ONE pending registration on top of a predecessor — the
 * single subclass, and the only place the fluent modifiers live.
 *
 * There is deliberately NO class per slot combination. The runtime carries ALL
 * modifiers unconditionally; the TYPES do the slicing — `addClass` and friends
 * declare an `AddChain<Scopes, Slots, Gated>` return, and each modifier `Exclude`s
 * the slot(s) it consumes, so the bulk/scope/key facets are set at most once (an
 * APPEND via `withSignature` is deliberately repeatable) and the modifiers compose
 * in any order without the runtime knowing anything about which are still "open".
 * The gate that withholds the manifest face until a signature is supplied is a
 * TYPE-only construct — every node here carries every method.
 *
 * `as` / `withKey` / `withSignatures` REPLACE this node rather than appending: they
 * build a sibling over the SAME `__inner` predecessor with one facet refined. That
 * is what keeps `.addClass(...).as("singleton")` exactly ONE registration — an
 * appended transient shadow would be harmless for last-wins bare-token resolution
 * but would pollute collection aggregation (`Array<T>` / `Iterable<T>`), which
 * enumerates every registration of T. `withSignature` also replaces the node, but
 * grows the registration's OWN signature list (adds an injectable overload), so it
 * still contributes exactly one entry.
 */
class AddBuilderManifest<Scopes extends string> extends ServiceManifestClass<Scopes> {
  /** The captured call, kept so a modifier can re-materialise from it. */
  readonly #pending: PendingRegistration;
  /** The classified entry this node contributes — materialised once, at construction. */
  readonly #entry: ManifestEntry;

  public constructor(inner: Iterable<ManifestEntry>, pending: PendingRegistration) {
    super(inner);
    this.#pending = pending;
    // Materialise EAGERLY: classification is where the registration-time errors
    // are raised, so this is what makes them throw from the `add` / `as` /
    // `withKey` call rather than from a later `seal()`.
    this.#entry = materialise(pending);
    Object.freeze(this);
  }

  /**
   * Predecessor entries FIRST, own entry LAST — the whole reason authoring order
   * survives into the sealed indexes.
   */
  public override *[Symbol.iterator](): IterableIterator<ManifestEntry> {
    yield* this.__inner;
    yield this.#entry;
  }

  /** Refines one facet of the pending registration onto a sibling node. */
  #refine(refinement: Partial<PendingRegistration>): AddBuilderManifest<Scopes> {
    return new AddBuilderManifest<Scopes>(this.__inner, { ...this.#pending, ...refinement });
  }

  /**
   * APPENDS one overload's dependency slots to the registration's signature set.
   * `slots` is ONE overload (a `readonly DepSlot[]`); it is pushed onto the
   * existing signatures — base `[]` for the gated 2-arg form that supplied none —
   * so calling it repeatedly adds injectable overloads. Supplying the first
   * signature this way is what OPENS the gate at the type level (the manifest face
   * reappears once `'signatures'` is struck). Hand-writable:
   * `addClass(t, c, [[…]]).withSignature('a')` is exactly what the survive lowering
   * emits, so byte-parity holds.
   */
  public withSignature(...slots: readonly DepSlot[]): AddBuilderManifest<Scopes> {
    const base = this.#pending.signatures ?? [];
    return this.#refine({ signatures: [...base, slots] });
  }

  /**
   * REPLACES the whole signature set in bulk. `signatures` is the complete 2-D set
   * (each element one overload). Once-only at the type level — it strikes both the
   * append and bulk slots — so it cannot follow a `withSignature` append.
   */
  public withSignatures(...signatures: ReadonlyArray<readonly DepSlot[]>): AddBuilderManifest<Scopes> {
    return this.#refine({ signatures });
  }

  /**
   * Attaches the lifetime. Must name a declared scope; a registration that never
   * names one is transient. Equivalent to passing `scope` positionally — reach
   * for it when the facets genuinely arrive out of order.
   */
  public as(scope: Scopes): AddBuilderManifest<Scopes> {
    return this.#refine({ scope });
  }

  /**
   * Makes the registration KEYED, recomposing its effective token as `base#key`
   * off the retained BASE token (§98). Because the recomposed token is
   * re-classified, this can raise the same open-token registration error the
   * originating call would have — at THIS call, not at `seal()`.
   */
  public withKey(key: string): AddBuilderManifest<Scopes> {
    return this.#refine({ key });
  }
}

/**
 * The public registration-builder INTERFACE a di consumer holds — the
 * `IServiceManifestBase` interface bound to the concrete provider `build()`
 * returns (the reference registration-collection analog). Interface-first (not the
 * impl class) so the `@rhombus-std/di.transformer` augmentation — which merges the
 * authored `addClass<I>()` / `addFactory<I>()` / `addValue<I>()` forms onto
 * `IServiceManifestBase` — surfaces on a consumer typing against
 * `ServiceManifest<S>`. A class would not inherit those augmented overloads; the
 * interface does.
 *
 * The constructor side (`ServiceManifestCtor`) and the constructible
 * `ServiceManifest` VALUE live in `@rhombus-std/di`, alongside the `build()`
 * prototype-patch that makes `new ServiceManifest().build()` produce a provider.
 */
export type IServiceManifest<S extends string = 'singleton'> = IServiceManifestBase<
  S,
  IServiceProvider<S>
>;

// THE MANIFEST AS A VALUE — and the pieces underneath the fluent surface.
//
// The scenario is a TEST HOST: something a team ships alongside its application
// so an integration test can take the production wiring, swap the parts that
// talk to the outside world for fakes, assert that it swapped what it meant to,
// and build a container. That is the one job that needs the manifest as a DATA
// STRUCTURE rather than as a chain of verbs — a test host receives a manifest it
// did not compose and has to reason about what is in it.
//
// It is also where the surface's less obvious members earn their place:
//
//   - `ServiceManifestClass` — the class every cross-package augmentation is
//     installed onto. A test host does not construct it; it recognises it.
//   - `ServiceManifestDescriptorAugmentations` — the STANDALONE call surface
//     behind the fluent `removeAll(…)` verb, which is what a caller reaches for
//     when it has an ordinary function rather than a receiver in hand. (Its
//     sibling `ServiceManifestContainerBuilderAugmentations`, behind `build()`,
//     is the ENGINE's contribution and therefore lives with the composition
//     root — see the app's own chapter.)
//   - `hasRegistrations` / `removeRegistrations` / `seal` — the intrinsic
//     primitives those augmentations are built ON, present so that a tool can
//     ask the same questions without going through the fluent layer.
//   - the capability interfaces `IServiceQuery`, `IRequiredResolver`,
//     `IScopeFactory` — the narrow faces of a provider, so a function can ask
//     for exactly the power it needs.
//
// WHERE THE CHAPTER SPLITS, and the split is itself the lesson. Everything above
// is reading and rewriting a manifest, which is library work, and all of it is
// here. Running the result is not: `build()`, `createScope()`, `resolve()` and
// `dispose()` are the composition root's verbs. So the test host's second half —
// swap the fakes in, stand the container up, exercise it — is staged by each
// example app's own `manifest-surface-demo.ts` and appended to these lines. It
// calls back into `forTests`, `missingFrom`, `requireCheckout` and `inScope`
// below, so the library still owns every piece of that test host except the
// container itself.
//
// The three capability helpers stay because they are exactly what those di.core
// interfaces are FOR: a per-request pipeline really does take an `IScopeFactory`
// and open a frame, a startup probe really does take an `IServiceQuery`. Each
// receives its narrow face as an ordinary parameter — the distinction that
// matters is not "does library code ever touch a provider" but "did it have to
// reach for one to get it".
//
// Dialect-independent: none of this has a type-driven form. Both example apps
// run THIS chapter rather than a with-transformer mirror.
//
// Every import is `@rhombus-std/di.core`, this library's only di dependency.

import { overrideSignatures, ServiceManifestClass, ServiceManifestDescriptorAugmentations, SIGNATUREFOR_NAME,
  SIGNATURESFOR_NAME } from '@rhombus-std/di.core';
import type { AddChain, Ctor, DepSignatures, DepTarget, Factory, IAsBuilder, IRequiredResolver, IResolver,
  IScopeFactory, IServiceManifest, IServiceManifestBase, IServiceProvider, IServiceQuery, IWithKeyBuilder,
  IWithSignatureBuilder, IWithSignaturesBuilder, Lifetime, Producer, Slot, Token } from '@rhombus-std/di.core';

// A note on what is NOT imported, since it is the constraint the whole chapter
// is written against: `@rhombus-std/di` — the resolution engine — appears
// nowhere, which is why a manifest arrives as a parameter and a provider is
// somebody else's to make.

// ── the application being tested ─────────────────────────────────────────────

/** Talks to a real payment processor. Exactly what a test must not do. */
class LivePaymentGateway {
  public readonly kind = 'live';

  public charge(amountMinor: number): string {
    return `charged ${amountMinor} against the real processor`;
  }
}

/** The stand-in. Same shape, no network. */
class FakePaymentGateway {
  public readonly kind = 'fake';

  public charge(amountMinor: number): string {
    return `pretended to charge ${amountMinor}`;
  }
}

/** Writes to disk. Also not something a test wants. */
class DiskLedger {
  public readonly kind = 'disk';
}

/** In-memory stand-in for the ledger. */
class MemoryLedger {
  public readonly kind = 'memory';
}

/** A clock the application injects everywhere. Deterministic already. */
class FixedClock {
  public now(): string {
    return '2024-05-01T09:00:00Z';
  }
}

/** The service under test — the one thing a test host must NOT replace. */
class Checkout {
  public constructor(
    public readonly gateway: LivePaymentGateway | FakePaymentGateway,
    public readonly ledger: DiskLedger | MemoryLedger,
    public readonly clock: FixedClock,
  ) {}

  public run(amountMinor: number): string {
    return `${this.clock.now()} ${this.gateway.charge(amountMinor)} -> ${this.ledger.kind} ledger`;
  }
}

const GATEWAY_TOKEN = 'shop:IPaymentGateway';
const LEDGER_TOKEN = 'shop:ILedger';
const CLOCK_TOKEN = 'shop:IClock';
const CHECKOUT_TOKEN = 'shop:ICheckout';
const METRICS_TOKEN = 'shop:IMetrics';

/**
 * The ports a startup self-check asks about — published so the composition root
 * can run {@link missingFrom} without hand-copying token strings out of this
 * file, which is the sort of copy that goes stale silently.
 *
 * `IMetrics` is on the list and is deliberately never registered by
 * {@link addShopServices}: a checklist that always passes proves nothing about
 * the check.
 */
export const SHOP_SELF_CHECK_TOKENS: readonly Token[] = [GATEWAY_TOKEN, LEDGER_TOKEN, METRICS_TOKEN];

/**
 * The production wiring, as the application itself would compose it.
 *
 * `Lifetime<'singleton'>` is the named-tag type: `'singleton'` and `'transient'`
 * are built in, and any scope name an application declares joins the union.
 * Transient is the ABSENCE of a tag on the registration, never the literal
 * string — which is why the tag below is spelled out rather than defaulted.
 */
export function addShopServices(services: IServiceManifest<'singleton'>): IServiceManifest<'singleton'> {
  const lifetime: Lifetime<'singleton'> = 'singleton';
  let composed = services;
  composed = composed.addClass(GATEWAY_TOKEN, LivePaymentGateway, [[]], lifetime);
  composed = composed.addClass(LEDGER_TOKEN, DiskLedger, [[]], lifetime);
  composed = composed.addValue(CLOCK_TOKEN, new FixedClock());
  composed = composed.addClass(
    CHECKOUT_TOKEN,
    Checkout,
    [[GATEWAY_TOKEN, LEDGER_TOKEN, CLOCK_TOKEN]],
    lifetime,
  );
  return composed;
}

// ── 1. the receiver every augmentation lands on ──────────────────────────────

/**
 * Reports whether `value` is a registration builder this repo's augmentations
 * have been installed onto.
 *
 * `ServiceManifestClass` is the concrete collection — the object identity every
 * cross-package augmentation (`removeAll`, `addOptions`, `addLogging`,
 * `addHostedService`, `build`) is prototype-patched onto. That identity is
 * load-bearing: a bundling package that inlined a private copy of di.core would
 * fork the class, and the augmentations would install onto an object nobody
 * holds. A test host checking `instanceof` here is checking exactly that
 * invariant, which is the only honest reason to name the class at all.
 *
 * `ServiceManifest` (the value a consumer constructs) IS this class; the two
 * names differ only in which package exports them.
 */
export function isRegistrationBuilder(value: unknown): value is ServiceManifestClass<string> {
  return value instanceof ServiceManifestClass;
}

/**
 * The narrowing every helper below needs: from the public authoring INTERFACE to
 * the concrete collection.
 *
 * It is a cast rather than a check because the interface is deliberately smaller
 * than the class — `seal` / `hasRegistrations` / `removeRegistrations` are public
 * on the class and absent from the authoring surface, so a consumer reaches
 * removal and conditional-add through the fluent verbs and never as raw methods.
 * A tool that wants the primitives has to say out loud that it knows what it is
 * holding, and `isRegistrationBuilder` above is how it can check first.
 *
 * Two-step through `unknown` because the two types genuinely do not overlap in
 * the direction TypeScript checks — and in a program carrying the
 * `@rhombus-std/di.extras` augmentation the interface is wider still, so a
 * single-step cast compiles in one dialect and not the other.
 */
function asBuilder<S extends string>(services: IServiceManifest<S>): ServiceManifestClass<S> {
  return services as unknown as ServiceManifestClass<S>;
}

// ── 2. the standalone call surface ───────────────────────────────────────────

/**
 * Strips every registration bound to `token`, called through the augmentation
 * const rather than through the fluent method.
 *
 * Each augmentation set is exported as a plain object of RECEIVER-FIRST
 * functions, and installing it onto the prototype is a second, separate step.
 * `services.removeAll(token)` and
 * `ServiceManifestDescriptorAugmentations.removeAll(services, token)` are the
 * same function reached two ways. The standalone form is what you want when the
 * call has to be a value — passed to `map`, composed into a pipeline, or (as
 * here) used from a helper that must keep working even in a program that has not
 * imported the barrel whose side effect installs the methods.
 */
export function withoutToken(
  services: IServiceManifest<'singleton'>,
  token: Token,
): IServiceManifest<'singleton'> {
  // The receiver-first members are typed against the CLASS and the widest scope
  // union, because an augmentation set is authored once for every manifest there
  // will ever be. A caller with a narrower scope union re-narrows on the way
  // out; the fluent method does that for you, which is most of why it exists.
  return ServiceManifestDescriptorAugmentations.removeAll(
    asBuilder<string>(services),
    token,
  ) as IServiceManifest<'singleton'>;
}

// `build()`'s standalone form is the same shape one package over: di.core ships
// the collection with a `build()` that only throws, and `@rhombus-std/di`
// supplies the real one through the augmentation registry when it is imported.
// Which is exactly why it is NOT demonstrated here — the augmentation set IS the
// engine, so naming it would make this library depend on the thing it exists to
// show a library never needs. The app's chapter reaches it instead, where the
// two halves are visible from the side that owns both.

// ── 3. the intrinsic primitives ──────────────────────────────────────────────

/**
 * Answers the two questions a test host actually has, using the manifest's own
 * primitives rather than the augmentations built on them.
 *
 * `hasRegistrations(token)` is what `tryAdd*` consults before deciding whether
 * to register; `removeRegistrations(token)` is what `removeAll` and `replace*`
 * call to clear the way. They are deliberately NOT on the public authoring
 * interface — a consumer reaches them through the fluent verbs — but they are
 * public on the class, which is what lets a tool ask directly.
 *
 * `removeRegistrations` REBASES rather than filters in place: the survivors
 * become the inner list of a fresh root, collapsing the chain walked so far into
 * one frozen array. The receiver still holds everything it had.
 */
export function auditToken(services: ServiceManifestClass<'singleton'>, token: Token): readonly string[] {
  const stripped = services.removeRegistrations(token);
  return [
    `  hasRegistrations(${token}): ${services.hasRegistrations(token)}`,
    `  after removeRegistrations: receiver ${services.hasRegistrations(token)}, `
    + `result ${asBuilder(stripped).hasRegistrations(token)}`,
  ];
}

/**
 * Reports the sealed snapshot's shape.
 *
 * `seal()` is the half of `build()` that belongs to the COLLECTION: it walks the
 * chain once and buckets the entries into two frozen indexes — exact
 * registrations by token, open templates by canonical base. The engine-building
 * half lives in `@rhombus-std/di`, which is why di.core can ship a registration
 * builder at all without depending on a resolver.
 *
 * Sealing directly is the cheap way to ask "what would this container contain?"
 * without paying for a provider.
 */
export function describeSeal(services: ServiceManifestClass<'singleton'>): string {
  const { registrations, openRegistrations } = services.seal();
  const tokens = [...registrations.keys()].length;
  const templates = [...openRegistrations.keys()].length;
  return `  seal(): ${tokens} exact token(s), ${templates} open base(s), both indexes frozen`;
}

// ── 4. the registration continuation, as a value ─────────────────────────────

/**
 * Applies a house lifetime policy to a pending registration.
 *
 * `addClass(token, ctor, signatures)` does not return a manifest — it returns an
 * `AddChain`, the immutable CONTINUATION carrying whichever modifier faces the
 * call has not already filled. Naming that type is what lets a policy like this
 * one be a function instead of something every call site has to remember.
 *
 * The type parameters say precisely what is left to fill: `Slot` is the union of
 * the four modifier names (`'signature' | 'signatures' | 'scope' | 'key'`), and
 * an `AddChain` withholds the manifest face while it is GATED — that is, until a
 * signature has arrived. Requiring `'scope'` to still be open is the whole
 * safety of this helper: it cannot be handed a chain whose lifetime was already
 * named.
 */
export function asSingleton(
  chain: AddChain<'singleton', 'scope' | 'key', false>,
): IServiceManifest<'singleton'> {
  // Typed as the FACE rather than as the whole chain, so the body can only do
  // the one thing the policy is about. `Slot` names the four modifier slots the
  // type parameter ranges over — see `IChainFaces` below for all four faces.
  const lifetime: IAsBuilder<'singleton', 'scope' | 'key', false> = chain;
  return lifetime.as('singleton') as IServiceManifest<'singleton'>;
}

/**
 * The four modifier faces, named in one place so the shape of the fluent chain
 * is readable as types rather than only as call sites.
 *
 * Each face carries exactly one modifier and returns the chain minus that slot,
 * which is what makes the ordering free and the repetition impossible:
 *
 *   - `IWithSignatureBuilder`  — `withSignature(...)`, APPENDS one overload and
 *                                is repeatable;
 *   - `IWithSignaturesBuilder` — `withSignatures(...)`, supplies the whole set
 *                                and is once-only;
 *   - `IAsBuilder`             — `as(scope)`, the lifetime tag;
 *   - `IWithKeyBuilder`        — `withKey(key)`, composing `token#key`.
 */
export interface IChainFaces {
  readonly appendOverload: IWithSignatureBuilder<'singleton', 'scope', true>;
  readonly wholeSet: IWithSignaturesBuilder<'singleton', 'scope', true>;
  readonly lifetime: IAsBuilder<'singleton', 'key', false>;
  readonly key: IWithKeyBuilder<'singleton', 'scope', false>;
}

// ── 5. narrowing a provider to a capability ──────────────────────────────────
//
// The three functions below are the only ones in this file that touch a
// container at all, and they are here rather than at the composition root
// because they are what these di.core interfaces EXIST for. `IServiceQuery`,
// `IRequiredResolver` and `IScopeFactory` are each one face of a provider,
// published separately so a function can ask for exactly the power it needs —
// and the code that asks is library code. A root already holds the whole
// provider; it has nothing to narrow.
//
// Each takes its face as an ordinary PARAMETER, which is the line that matters.
// The library is never the one that reached: the root builds the container and
// hands over the one capability the call needs, exactly as it would hand over a
// clock or a logger. That the root then calls all three back-to-back is what the
// chapter's second half looks like.

/**
 * A startup self-check that only ever ASKS whether things are registered.
 *
 * Taking `IServiceQuery` rather than the whole provider is not pedantry: the
 * narrow type is a promise to the caller that this function cannot construct
 * anything, cannot open a scope and cannot dispose the container. `isService`
 * does not build — it answers about the REGISTRATION — so the type and the
 * behaviour agree.
 */
export function missingFrom(query: IServiceQuery, required: readonly Token[]): readonly Token[] {
  return required.filter((token) => !query.isService(token));
}

/**
 * The other named capability: `IRequiredResolver` is the resolve-or-throw face
 * (the keyed singular and plural forms both live on it). A function that must
 * have its dependency, and has no business softening the miss, asks for this.
 */
export function requireCheckout(resolver: IRequiredResolver): Checkout {
  return resolver.resolve<Checkout>(CHECKOUT_TOKEN);
}

/**
 * `IScopeFactory` is the third face — scope creation on its own. A request
 * pipeline needs exactly this and nothing else: open a frame per request, hand
 * the frame to the handler, close it.
 *
 * This is the one place library code here opens and closes a scope, and it is
 * deliberate: middleware is the canonical `IScopeFactory` consumer, and a
 * per-request frame is not the root's to open — the root does not know when a
 * request starts. What the library still does not do is DECIDE there should be a
 * container; it is handed the factory and takes the narrowest thing that will
 * do. Note the `finally`: whoever opens a frame closes it, on every path.
 */
export function inScope<S extends string, T>(scopes: IScopeFactory<S>, name: S, run: (scope: IResolver) => T): T {
  const scope = scopes.createScope(...([name] as Parameters<IScopeFactory<S>['createScope']>));
  try {
    return run(scope);
  } finally {
    scope.dispose();
  }
}

// ── 6. pinning a slot the derivation got wrong ───────────────────────────────

/**
 * Repoints selected slots of an already-derived signature set.
 *
 * `overrideSignatures(signatures, overrides)` overlays a SPARSE positional array
 * onto every overload: a hole in `overrides` keeps the derived slot, a string
 * replaces it, and a shorter array never truncates. It is a RUNTIME helper —
 * unlike the compile-time mints — precisely so the override list can be computed
 * rather than written literally, which is what a test host needs.
 *
 * The use here is the canonical one: a class whose constructor names a port this
 * application registers under a different token, and whose source cannot be
 * edited because it belongs to somebody else.
 */
export function repointFirstSlot(signatures: DepSignatures, token: Token): DepSignatures {
  return overrideSignatures(signatures, [token]);
}

/**
 * The two identifier names the authoring-time signature mints are recognised BY.
 *
 * They exist because tooling — the transformer itself, and any guard a repo
 * writes to prove its shipped bundles contain no un-lowered authoring call —
 * has to match the call by NAME, and a hard-coded string in a second place is a
 * second place to get it wrong. This is the honest consumer shape: a scan over
 * source text that asks "does this file still contain a mint that should have
 * been lowered away?".
 *
 * @param source The text to scan.
 * @returns The mint names found, in the order they are declared.
 */
export function authoringMintsIn(source: string): readonly string[] {
  return [SIGNATUREFOR_NAME, SIGNATURESFOR_NAME]
    .filter((name) => new RegExp(`\\b${name}\\s*<`).test(source));
}

// ── 7. the test host ─────────────────────────────────────────────────────────
//
// What a test host actually IS, once the container is taken out of it: a
// manifest-to-manifest function. `forTests` is the whole of it. Building the
// result and running something against it is the caller's half, and the caller
// is a composition root — see either example app's `manifest-surface-demo.ts`.

/**
 * Takes the application's wiring and returns it with the outside world replaced.
 *
 * `replace*` rather than plain `add*`: registering a second implementation at
 * the same token leaves BOTH, and a collection resolve would then see the live
 * gateway too — a test that "passes" while quietly holding a real processor is
 * worse than one that fails. `replace` drops what is there and registers anew.
 */
export function forTests(services: IServiceManifest<'singleton'>): IServiceManifest<'singleton'> {
  let composed = services;
  composed = composed.replace(GATEWAY_TOKEN, FakePaymentGateway, [[]], 'singleton');
  composed = composed.replace(LEDGER_TOKEN, MemoryLedger, [[]], 'singleton');
  return composed;
}

/**
 * Runs the manifest-as-data half of the tour and returns its report lines.
 *
 * Read the signature before the body, because it is the chapter's real lesson.
 * One parameter: a manifest somebody else composed. There is no second parameter
 * and no import that could supply one — a library that cannot name the engine
 * cannot construct a manifest and cannot turn one into a provider — and it turns
 * out that nothing this chapter is ABOUT needed either. Recognising the receiver,
 * reaching the intrinsic primitives, calling a verb through its standalone form,
 * applying a house policy to a pending registration, repointing a derived slot:
 * all of it is the manifest as a value, and all of it is library work.
 *
 * The composition root stages the rest — the swap, the container, the run — from
 * the helpers exported above, and appends its lines to these.
 *
 * @param production The wiring under test, already composed — pass
 *   `addShopServices(<a fresh manifest>)`.
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateManifestSurface(production: IServiceManifest<'singleton'>): readonly string[] {
  const lines: string[] = ['=== di manifest surface (dialect-independent) ==='];

  // The receiver identity.
  lines.push(`the manifest is the augmentation receiver: ${isRegistrationBuilder(production)}`);

  // The intrinsic primitives, on the production wiring.
  lines.push('asking the manifest directly, no fluent verbs:');
  lines.push(...auditToken(asBuilder(production), GATEWAY_TOKEN));
  lines.push(describeSeal(asBuilder(production)));

  // The standalone call surface.
  const withoutClock = withoutToken(production, CLOCK_TOKEN);
  lines.push(
    'the standalone call surface — the same verbs, receiver-first:'
      + `\n  removeAll(services, IClock) left ${asBuilder(withoutClock).hasRegistrations(CLOCK_TOKEN)}`
      + ` on the result and ${asBuilder(production).hasRegistrations(CLOCK_TOKEN)} on the original`,
  );

  // The chain as a value, started from the manifest this tour was HANDED. Safe
  // for exactly the reason the chapter keeps making: every verb returns a NEW
  // manifest, so branching off `production` here cannot disturb the wiring the
  // lines above were reported from.
  const policy = asSingleton(production.addClass(METRICS_TOKEN, FixedClock, [[]]));
  lines.push(
    `a house policy applied to a pending registration (AddChain): IMetrics registered as ${
      [...policy].filter((entry) => entry.kind === 'exact' && entry.token === METRICS_TOKEN)
        .map((entry) => (entry.kind === 'exact' ? entry.registration.scope : undefined))
        .join('')
    }`,
  );

  // The override merge.
  const derived: DepSignatures = [[GATEWAY_TOKEN, LEDGER_TOKEN]];
  const repointed = repointFirstSlot(derived, 'shop:IPaymentGateway#sandbox');
  lines.push(`overrideSignatures pins slot 0 and keeps the rest: ${JSON.stringify(repointed[0])}`);

  // The tooling constants.
  lines.push(
    `the mint names tooling matches on: ${
      authoringMintsIn('const s = signaturefor<[IClock]>(); const all = signaturesfor<[[IClock]]>();').join(', ')
    }`,
  );

  return lines;
}

// ── the remaining named types, in type position ──────────────────────────────
//
// The ABI's vocabulary types have no runtime footprint of their own, so the only
// way to reference them is to USE them — which is what the aliases below do, in
// the shapes a caller would actually meet them in. Each is a real question a
// tool asks: what can be registered, what does a registration produce, what does
// a manifest's public authoring surface look like, and how do the two spellings
// of the collection relate.

/** What `addClass` accepts, and what `addFactory` accepts — the two `DepTarget` halves. */
export type Registerable = { readonly ctor: Ctor; readonly factory: Factory; readonly either: DepTarget; };

/** What every registration normalises to: one call, positional resolved args in. */
export type NormalisedProducer = Producer;

/** The public authoring surface, which the concrete collection implements. */
export type AuthoringSurface = IServiceManifestBase<'singleton', IServiceProvider<'singleton'>>;

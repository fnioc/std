// THE RESOLUTION SURFACE, authored by hand — every way to ask the container for
// something, with an explicit string token at every call site and no transformer
// anywhere.
//
// This file is the twin of ../../examples.app.with-transformer/src/resolution-demo.ts.
// The two register the SAME container (both call `addCheckoutServices`) and print
// the SAME lines; diff them and the only difference is the authoring dialect. That
// is the repo's no-transformer-first rule made checkable: the explicit forms below
// are the primary, complete API, and the tokenless forms in the twin are sugar
// that lowers to exactly this.
//
// The tokens come from the library that registered the services, because a token
// is a shared name — the consumer and the producer must agree on the string, and
// exporting it from the producer is how a plugin-less codebase keeps them in step.

import { isProviderToken, RESOLVER_TOKEN, ServiceManifest, UnregisteredTokenError } from '@rhombus-std/di';
import type { IResolver, IServiceManifest } from '@rhombus-std/di';

import type { CheckoutOrder, IAuditTrail, IExchangeRates, IFraudScreen, IOrderValidator, IPaymentGateway,
  IPaymentRouter, IReceipt, IReceiptNumbering } from '@rhombus-std/examples.contracts';
import { addCheckoutServices, CHECKOUT_TOKENS } from '@rhombus-std/examples.lib.without-transformer';

// Fixed orders — no clock, no randomness, so the output is byte-stable.
const ORDER_A: CheckoutOrder = { reference: 'A-1001', amountMinor: 4250, method: 'wallet' };
const ORDER_B: CheckoutOrder = { reference: 'B-2002', amountMinor: 990, method: 'card' };
const ORDER_C: CheckoutOrder = { reference: 'C-3003', amountMinor: 12000, method: 'invoice' };
const ORDER_X: CheckoutOrder = { reference: 'X-9009', amountMinor: 900_000, method: 'crypto' };

/**
 * Runs the resolution tour and returns the report lines.
 *
 * `resolver` is typed as the `IResolver` INTERFACE rather than the container
 * class: everything below is available to any injected dependency that declares
 * an `IResolver` parameter, not just to code holding the root provider.
 */
async function tour(resolver: IResolver): Promise<string[]> {
  const t = CHECKOUT_TOKENS;
  const lines: string[] = ['=== di resolution — without transformer ==='];

  // ── required vs optional ───────────────────────────────────────────────────
  //
  // `resolve` and `tryResolve` differ on exactly one axis: what an UNREGISTERED
  // token does. Reach for `resolve` when the service is part of the deal — a
  // missing one is a wiring bug you want to hear about at startup, not a
  // `undefined` that leaks three call frames away. Reach for `tryResolve` when
  // absence is a legitimate deployment shape: an audit sink, a metrics exporter,
  // a debug-only inspector.
  //
  // The softening is narrow, and that narrowness is the point: only an
  // unregistered TOKEN yields `undefined`. A registered service whose own
  // dependency is missing still throws from `tryResolve`, because that is a
  // broken container rather than an absent feature.
  lines.push('required vs optional lookup');
  const router = resolver.resolve<IPaymentRouter>(t.router);
  lines.push(`  resolve(IPaymentRouter): resolved ${router.constructor.name}`);
  try {
    resolver.resolve<IFraudScreen>(t.fraudScreen);
    lines.push('  resolve(IFraudScreen): UNREACHABLE');
  } catch (error) {
    // Branch on the typed error class, never on the message text.
    const kind = error instanceof UnregisteredTokenError ? 'UnregisteredTokenError' : 'unexpected error';
    lines.push(`  resolve(IFraudScreen): ${kind} — a required miss is loud`);
  }
  const audit = resolver.tryResolve<IAuditTrail>(t.audit);
  lines.push(`  tryResolve(IAuditTrail): ${audit ? 'present' : 'absent'}`);
  lines.push(`  tryResolve(IFraudScreen): ${resolver.tryResolve<IFraudScreen>(t.fraudScreen) ?? 'undefined'}`);
  // `isService` answers the same question WITHOUT constructing anything, which
  // is what makes it safe to call on a hot path or in a startup self-check.
  lines.push(`  isService(IFraudScreen): ${resolver.isService(t.fraudScreen)} — a probe, nothing is built`);

  // ── collection resolution ──────────────────────────────────────────────────
  //
  // Three classes registered under one token. Asking for the ARRAY wrapper over
  // that token (`Array<…:IOrderValidator>`) aggregates all three in registration
  // order; asking for the bare token would hand back only the last one. This is
  // the shape for "several things, all of them run": validators, event handlers,
  // middleware, plugins. An unregistered element type aggregates to an EMPTY
  // array rather than throwing, so a pipeline with nothing plugged in still runs.
  lines.push('collection resolution — 3 registrations share one token, all of them run');
  const validators = resolver.resolve<IOrderValidator[]>(t.validators);
  for (const order of [ORDER_A, ORDER_X]) {
    for (const validator of validators) {
      lines.push(`  ${order.reference}: ${validator.name} → ${validator.check(order)}`);
    }
  }

  // ── keyed resolution ───────────────────────────────────────────────────────
  //
  // A key is not a parallel lookup system: it is a `#<key>` suffix on the
  // ordinary token, so `…:IPaymentGateway#card` hits the same exact-match lookup
  // every other token does. Two shapes:
  //   - SINGULAR — `resolve(base, key)` composes `base#key` and resolves one;
  //   - PLURAL   — `resolve(base, /regex/)` tests the KEY PORTION of every
  //     registration under that base and returns the matches, in registration
  //     order. Zero matches is `[]`, never a throw.
  // The plural scan is what lets a UI ask "what payment methods are available?"
  // without any registry the app has to maintain by hand.
  lines.push('keyed resolution — one base token, three keys');
  lines.push(`  configured methods (plural scan /.+/): ${router.configuredMethods().join(', ')}`);
  for (const order of [ORDER_A, ORDER_B]) {
    lines.push(`  ${order.reference} checkout (key "${order.method}"): ${router.checkout(order)}`);
    // The optional sink, used only because the probe above found one.
    audit?.record(order.reference);
  }
  const crypto = resolver.tryResolve<IPaymentGateway>(t.gateway, 'crypto');
  lines.push(`  tryResolve at key "crypto": ${crypto?.label ?? 'undefined'}`);

  // ── factory resolution ─────────────────────────────────────────────────────
  //
  // `resolveFactory` hands back a CALLABLE instead of an instance. The `params`
  // list names the arguments the CALLER supplies; every other constructor slot
  // is resolved from the container as usual. Two consequences worth internalising:
  //   - a parameterized factory builds a FRESH instance per call (caching would
  //     be wrong — the arguments differ every time), so the receipt numbers below
  //     keep advancing; and
  //   - the ONLY thing that can go wrong with the target is that it is
  //     UNREGISTERED. Any registration kind is a legal target — the factory calls
  //     the registration's producer, and `addClass` / `addFactory` / `addValue`
  //     all have one. Reaching for a factory over a token nobody registered
  //     throws `FactoryTargetError` at the moment the callable is built, not on
  //     first call, so a mis-wired factory slot surfaces during construction.
  // The same slot shape can be INJECTED rather than resolved: `PaymentRouter`
  // takes `mintReceipt: (order) => IReceipt` as a constructor parameter, which is
  // how the checkout lines above minted receipts #1001 and #1002.
  lines.push('factory resolution — the caller supplies what the container cannot know');
  const mintReceipt = resolver.resolveFactory<(order: CheckoutOrder) => IReceipt>(t.receipt, [t.order]);
  lines.push(`  mint ${ORDER_C.reference}: ${mintReceipt(ORDER_C).text}`);
  lines.push(`  mint ${ORDER_C.reference} again: ${mintReceipt(ORDER_C).text} — never cached`);
  // The NO-params form is different in kind: with nothing for the caller to
  // supply it routes through the ordinary resolve path and therefore HONOURS the
  // target's registered lifetime. The numbering counter is a singleton, so both
  // calls hand back the same instance. A factory is about DEFERRING and REPEATING
  // a lookup; forcing a fresh object is what the parameterized form does, and only
  // because it must.
  const numbering = resolver.resolveFactory<() => IReceiptNumbering>(t.numbering);
  lines.push(`  zero-arg factory honours the target lifetime: ${numbering() === numbering()}`);

  // ── async resolution ───────────────────────────────────────────────────────
  //
  // Nothing is registered at the bare rates token; the only registration is
  // `Promise<…:IExchangeRates>`. `resolveAsync` is the one verb allowed to
  // satisfy a miss from that honest promise registration — the synchronous
  // `resolve` would (correctly) report the bare token as unregistered rather than
  // hand back a half-built value.
  lines.push('async resolution — satisfied by the Promise<T> registration');
  const rates = await resolver.resolveAsync<IExchangeRates>(t.rates);
  lines.push(`  rates as of ${rates.asOf}, EUR at ${rates.rate('EUR')}`);

  // ── the provider as a service ──────────────────────────────────────────────
  //
  // The container can hand back ITSELF: a parameter typed `IResolver` gets the
  // live provider view, and `RESOLVER_TOKEN` is the intrinsic token that names
  // it. No registration exists for it — `isProviderToken` is the predicate that
  // says so, and `isService` answers `true` anyway because the engine resolves
  // the token structurally.
  //
  // Injecting the provider is USUALLY a smell. It hides a class's real
  // dependencies from anyone reading its constructor, turns wiring mistakes from
  // startup failures into runtime ones, and forces tests to build a container
  // where a fake object would have done. The honest test: could this have been an
  // ordinary constructor parameter? If yes, make it one.
  //
  // It is occasionally correct, and this example contains both legitimate cases:
  // `PaymentRouter` and `MethodIsConfigured` select a service by a KEY that does
  // not exist until an order arrives. No constructor parameter can express "the
  // gateway for whichever method the buyer picks", so the container itself is the
  // dependency.
  lines.push('the provider as a service — usually a smell, occasionally correct');
  lines.push(`  isProviderToken(RESOLVER_TOKEN): ${isProviderToken(RESOLVER_TOKEN)}`);
  lines.push(`  isService(RESOLVER_TOKEN): ${resolver.isService(RESOLVER_TOKEN)} — intrinsic, nothing registered it`);
  const view = resolver.resolve<IResolver>(RESOLVER_TOKEN);
  lines.push(`  the injected view IS the live container: ${view.resolve<IPaymentRouter>(t.router) === router}`);

  // ── what the optional sink recorded ────────────────────────────────────────
  const recorded = audit ? `${audit.entries.length} entries, last ${audit.entries.at(-1)}` : 'no sink wired';
  lines.push(`optional audit trail: ${recorded}`);

  return lines;
}

/**
 * Builds a container for the checkout scenario and walks the whole resolution
 * surface over it, returning a deterministic report for the caller to print.
 */
export async function demonstrateResolution(): Promise<readonly string[]> {
  let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
  services = addCheckoutServices(services);

  // `build()` hands back a FRAMELESS provider: it can resolve, but no scope is
  // open, so a `"singleton"`-tagged registration has no frame to be cached in and
  // resolves transiently instead. Opening the frame is what makes the shared
  // receipt counter and the audit trail actually shared.
  const provider = services.build().createScope('singleton');
  try {
    return await tour(provider);
  } finally {
    // `disposeAsync`, not `dispose`. The scope caches the `Promise<IExchangeRates>`
    // registration's own promise, and a synchronous teardown cannot await it — so
    // the engine refuses rather than dropping it, with `AsyncDisposalRequiredError`.
    // The rule to take away: a container holding anything async is closed async.
    await provider.disposeAsync();
  }
}

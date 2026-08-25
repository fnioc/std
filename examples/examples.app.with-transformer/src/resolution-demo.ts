// THE RESOLUTION SURFACE, authored from types — every way to ask the container
// for something, with the service type DERIVED at each call site.
//
// This file is the twin of ../../examples.app.without-transformer/src/resolution-demo.ts.
// The two register the SAME container (both call `addCheckoutServices`) and print
// the SAME lines; diff them and the only difference is the authoring dialect. That
// is the repo's no-transformer-first rule made checkable: the explicit forms in
// the twin are the primary, complete API, and the derived forms below are sugar
// for exactly those.
//
// Nothing here names a token. The library registered against the shared contract
// types, and `typefor<T>()` runs the very same derivation over the very same
// declarations — so consumer and producer meet on the type rather than on a
// string they each have to spell correctly.

import { di } from '@rhombus-std/di';
import { DefaultManifest, LifetimeModel, Type } from '@rhombus-std/di.core';
import type { ImportedType, IServiceProvider, Manifest } from '@rhombus-std/di.core';
import { typefor } from '@rhombus-std/primitives.extras';

import type { CheckoutOrder, IAuditTrail, IExchangeRates, IFraudScreen, IOrderValidator, IPaymentGateway, IPaymentRouter, IReceipt } from '@rhombus-std/examples.contracts';
import { addCheckoutServices } from '@rhombus-std/examples.lib.without-transformer';

// Fixed orders — no clock, no randomness, so the output is byte-stable.
const ORDER_A: CheckoutOrder = { reference: 'A-1001', amountMinor: 4250, method: 'wallet' };
const ORDER_B: CheckoutOrder = { reference: 'B-2002', amountMinor: 990, method: 'card' };
const ORDER_C: CheckoutOrder = { reference: 'C-3003', amountMinor: 12000, method: 'invoice' };
const ORDER_X: CheckoutOrder = { reference: 'X-9009', amountMinor: 900_000, method: 'crypto' };

/**
 * Runs `attempt` and reports what came back, so a member that is declared but
 * has no behaviour yet leaves a line rather than ending the tour.
 */
function attempted(attempt: () => string): string {
  try {
    return attempt();
  } catch (error) {
    return `${(error as Error).name} — declared, no behaviour yet`;
  }
}

/**
 * Runs the resolution tour, yielding the report lines.
 *
 * `provider` is typed as the `IServiceProvider` INTERFACE rather than the
 * container class: everything below is available to any injected dependency that
 * declares an `IServiceProvider` parameter, not just to code holding the root
 * provider.
 */
async function* tour(provider: IServiceProvider): AsyncGenerator<string> {
  yield '=== di resolution — with transformer ===';

  // ── required vs optional ───────────────────────────────────────────────────
  //
  // Every lookup goes through `resolve`, and `resolve` throws on an address
  // nothing can answer — it does not soften a miss on its own. What decides
  // whether absence is a wiring fault or a legitimate answer is the ADDRESS:
  // asking for the bare type is a hard requirement, while asking for
  // `Type.union(type, Type.typeLiteral(undefined))` adds the literal as a
  // FALLBACK, so an absent registration answers `undefined` instead of
  // throwing. The distinction below is entirely in which address each call
  // spells, never in a second verb.
  //
  // The softening is narrow, and that narrowness is the point: it answers for
  // the type that was ASKED for. A registration whose own dependency is
  // missing is itself unsatisfiable, so it too answers with absence rather
  // than a half-built object.
  yield 'required vs optional lookup';
  const router = provider.resolve(typefor<IPaymentRouter>()) as IPaymentRouter;
  yield `  resolve(IPaymentRouter): resolved ${router.constructor.name}`;
  try {
    provider.resolve(typefor<IFraudScreen>());
    yield '  resolve(IFraudScreen): UNREACHABLE';
  } catch (error) {
    yield `  resolve(IFraudScreen): ${(error as Error).name} — a required miss is loud`;
  }
  const audit = provider.resolve(Type.union(typefor<IAuditTrail>(), Type.typeLiteral(undefined))) as IAuditTrail | undefined;
  yield `  resolve(IAuditTrail): ${audit ? 'present' : 'absent'}`;
  yield `  resolve(IFraudScreen): ${provider.resolve(Type.union(typefor<IFraudScreen>(), Type.typeLiteral(undefined)))}`;
  // A presence question is exactly a union-wrapped lookup compared against
  // `undefined`: the literal fallback answers `undefined` instead of throwing,
  // so there is no dedicated member to reach for. Unlike a pure existence
  // check, this DOES resolve the service when one exists — cheap here, since
  // IFraudScreen is never registered at all, but worth naming: a presence
  // probe on something expensive to build is no longer free.
  yield `  resolve(IFraudScreen) !== undefined: ${provider.resolve(Type.union(typefor<IFraudScreen>(), Type.typeLiteral(undefined))) !== undefined}`;

  // ── collection resolution ──────────────────────────────────────────────────
  //
  // Three classes registered under one type. `resolveMany` aggregates all three
  // in registration order; asking for the bare type would hand back only one of
  // them. This is the shape for "several things, all of them run": validators,
  // event handlers, middleware, plugins. An unregistered element type aggregates
  // to an EMPTY list rather than throwing, so a pipeline with nothing plugged in
  // still runs.
  //
  // `resolveMany(element)` is sugar for asking for the collection type over it;
  // `Type.iterable(element)` spells that type, and either request reaches the
  // same aggregation.
  yield 'collection resolution — 3 registrations share one type, all of them run';
  const validators = [...provider.resolveMany(typefor<IOrderValidator>())] as IOrderValidator[];
  for (const order of [ORDER_A, ORDER_X]) {
    for (const validator of validators) {
      yield `  ${order.reference}: ${validator.name} → ${attempted(() => validator.check(order))}`;
    }
  }
  const asCollectionType = [
    ...(provider.resolve(Type.iterable(typefor<IOrderValidator>())) as Iterable<IOrderValidator>),
  ];
  yield `  the same aggregation asked for as a type: ${asCollectionType.length} validators`;

  // ── keyed resolution ───────────────────────────────────────────────────────
  //
  // A key is a TAG ON the service type rather than an argument beside it, so the
  // key travels inside the type and a request has to spell the same tag to reach
  // the registration. `Type.tag(base, "card")` is one type, and it hits the same
  // exact-match lookup every other type does — which is why a keyed registration
  // is invisible to a collection request over its bare base.
  yield 'keyed resolution — one base type, three keys';
  for (const order of [ORDER_A, ORDER_B]) {
    yield `  ${order.reference} checkout (key "${order.method}"): ${router.checkout(order)}`;
    // The optional sink, used only because the probe above found one.
    audit?.record(order.reference);
  }
  const crypto = provider.resolve(Type.union(Type.tag(typefor<IPaymentGateway>() as ImportedType, 'crypto'), Type.typeLiteral(undefined))) as
    | IPaymentGateway
    | undefined;
  yield `  resolve at key "crypto": ${crypto?.label}`;
  yield `  a keyed registration is not in the bare base's collection: `
    + `${[...provider.resolveMany(typefor<IPaymentGateway>())].length} gateways`;

  // ── factory slots ──────────────────────────────────────────────────────────
  //
  // A FACTORY SLOT injects a CALLABLE instead of an instance, and it is the
  // answer to "I need one of these later, with an argument the container cannot
  // know". A callable type spells it: its argument types are the ones the
  // CALLER supplies, and every other slot in the target's signature is resolved
  // from the container as usual.
  //
  // `PaymentRouter` takes exactly that — `mintReceipt: (order) => IReceipt` —
  // which is how the checkout lines above minted their receipts. A parameterized
  // factory builds a fresh instance per call, because the arguments differ every
  // time and a cached one would answer the wrong question.
  yield 'factory slots — the caller supplies what the container cannot know';
  yield `  mint ${ORDER_C.reference}: ${router.checkout(ORDER_C)}`;
  // The same slot asked for from OUTSIDE a constructor, rather than injected
  // into one: `resolve` over the callable's own type hands back the identical
  // factory `PaymentRouter` receives as a constructor parameter.
  const mintReceipt = provider.resolve(
    typefor<(order: CheckoutOrder) => IReceipt>(),
  ) as (order: CheckoutOrder) => IReceipt;
  yield `  asking the provider for one: ${mintReceipt(ORDER_C).text}`;

  // ── async registrations ────────────────────────────────────────────────────
  //
  // Nothing is registered at the bare rates type; the only registration is
  // `Promise<…:IExchangeRates>`, which is the honest way to say "this arrives
  // later". The container hands back the promise it was told about and the
  // caller awaits it — no half-built value ever appears.
  yield 'async registrations — the promise is the registration';
  const rates = await (provider.resolve(typefor<Promise<IExchangeRates>>()) as Promise<IExchangeRates>);
  yield `  rates as of ${rates.asOf}, EUR at ${rates.rate('EUR')}`;
  yield `  the bare type has no registration: ${provider.resolve(Type.union(typefor<IExchangeRates>(), Type.typeLiteral(undefined)))}`;

  // ── the provider as a service ──────────────────────────────────────────────
  //
  // The container can hand back ITSELF: a parameter typed `IServiceProvider`
  // gets the live provider, and `typefor<IServiceProvider>()` derives the type
  // that names it. No registration exists for it — the engine supplies it
  // structurally.
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
  yield 'the provider as a service — usually a smell, occasionally correct';
  const view = provider.resolve(typefor<IServiceProvider>()) as IServiceProvider;
  yield `  the injected view IS the live container: ${view === provider}`;

  // ── what the optional sink recorded ────────────────────────────────────────
  const recorded = audit ? `${audit.entries.length} entries, last ${audit.entries.at(-1)}` : 'no sink wired';
  yield `optional audit trail: ${recorded}`;
}

/**
 * Builds a container for the checkout scenario and walks the whole resolution
 * surface over it, yielding a deterministic report for the caller to print.
 *
 * The tour awaits a promised registration part-way through, so its lines arrive
 * asynchronously — every other chapter is an ordinary generator.
 */
export function demonstrateResolution(): AsyncGenerator<string> {
  let services: Manifest<unknown> = new DefaultManifest<unknown>();
  services = addCheckoutServices(services);
  return tour(di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build());
}

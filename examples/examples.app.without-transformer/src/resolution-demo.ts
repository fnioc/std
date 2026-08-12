// THE RESOLUTION SURFACE, authored by hand — every way to ask the container for
// something, with an explicit, hand-composed `Type` at every call site and no
// transformer anywhere.
//
// This file is the twin of ../../examples.app.with-transformer/src/resolution-demo.ts.
// The two register the SAME container (both call `addCheckoutServices`) and print
// the SAME lines; diff them and the only difference is the authoring dialect. That
// is the repo's no-transformer-first rule made checkable: the explicit forms below
// are the primary, complete API, and the type-driven forms in the twin are sugar
// for exactly this.
//
// The Types come from the library that registered the services, because a
// service Type is a shared identity — the consumer and the producer must
// resolve to the SAME interned `Type` object, and exporting it from the
// producer is how a plugin-less codebase keeps them in step.

import { DefaultManifest, RESOLVER_TYPE, Type } from '@rhombus-std/di.core';
import type { IServiceProvider, Manifest } from '@rhombus-std/di.core';
import '@rhombus-std/di';

import type { CheckoutOrder, IAuditTrail, IExchangeRates, IOrderValidator, IPaymentGateway, IPaymentRouter,
  IReceipt } from '@rhombus-std/examples.contracts';
import { addCheckoutServices, CHECKOUT_TYPES } from '@rhombus-std/examples.lib.without-transformer';

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
 * Runs the resolution tour and returns the report lines.
 *
 * `provider` is typed as the `IServiceProvider` INTERFACE rather than the
 * container class: everything below is available to any injected dependency that
 * declares an `IServiceProvider` parameter, not just to code holding the root
 * provider.
 */
async function tour(provider: IServiceProvider): Promise<string[]> {
  const t = CHECKOUT_TYPES;
  const lines: string[] = ['=== di resolution — without transformer ==='];

  // ── required vs optional ───────────────────────────────────────────────────
  //
  // `getRequiredService` and `getService` differ on exactly one axis: what an
  // ABSENT service does. Reach for the required form when the service is part of
  // the deal — a missing one is a wiring bug you want to hear about at startup,
  // not an `undefined` that leaks three call frames away. Reach for the optional
  // form when absence is a legitimate deployment shape: an audit sink, a metrics
  // exporter, a debug-only inspector.
  //
  // The softening is narrow, and that narrowness is the point: it answers for the
  // type that was ASKED for. A registration whose own dependency is missing is
  // itself unsatisfiable, so it too answers with absence rather than a
  // half-built object.
  lines.push('required vs optional lookup');
  const router = provider.getRequiredService(t.router) as IPaymentRouter;
  lines.push(`  getRequiredService(IPaymentRouter): resolved ${router.constructor.name}`);
  try {
    provider.getRequiredService(t.fraudScreen);
    lines.push('  getRequiredService(IFraudScreen): UNREACHABLE');
  } catch (error) {
    lines.push(`  getRequiredService(IFraudScreen): ${(error as Error).name} — a required miss is loud`);
  }
  const audit = provider.getService(t.audit) as IAuditTrail | undefined;
  lines.push(`  getService(IAuditTrail): ${audit ? 'present' : 'absent'}`);
  lines.push(`  getService(IFraudScreen): ${provider.getService(t.fraudScreen)}`);
  // `isService` answers the same question WITHOUT constructing anything, which is
  // what would make it safe on a hot path or in a startup self-check.
  lines.push(`  isService(IFraudScreen): ${attempted(() => String(provider.isService(t.fraudScreen)))}`);

  // ── collection resolution ──────────────────────────────────────────────────
  //
  // Three classes registered under one type. `getServices` aggregates all three
  // in registration order; asking for the bare type would hand back only one of
  // them. This is the shape for "several things, all of them run": validators,
  // event handlers, middleware, plugins. An unregistered element type aggregates
  // to an EMPTY list rather than throwing, so a pipeline with nothing plugged in
  // still runs.
  //
  // `getServices(element)` is sugar for asking for the collection type over it;
  // `Type.collection(element)` spells that type, and either request reaches the
  // same aggregation.
  lines.push('collection resolution — 3 registrations share one type, all of them run');
  const validators = [...provider.getServices(t.validator)] as IOrderValidator[];
  for (const order of [ORDER_A, ORDER_X]) {
    for (const validator of validators) {
      lines.push(`  ${order.reference}: ${validator.name} → ${attempted(() => validator.check(order))}`);
    }
  }
  const asCollectionType = [
    ...(provider.getRequiredService(Type.collection(t.validator)) as Iterable<IOrderValidator>),
  ];
  lines.push(`  the same aggregation asked for as a type: ${asCollectionType.length} validators`);

  // ── keyed resolution ───────────────────────────────────────────────────────
  //
  // A key is a TAG ON the service type rather than an argument beside it, so the
  // key travels inside the type and a request has to spell the same tag to reach
  // the registration. `Type.tag(base, "card")` is one type, and it hits the same
  // exact-match lookup every other type does — which is why a keyed registration
  // is invisible to a collection request over its bare base.
  lines.push('keyed resolution — one base type, three keys');
  for (const order of [ORDER_A, ORDER_B]) {
    lines.push(`  ${order.reference} checkout (key "${order.method}"): ${router.checkout(order)}`);
    // The optional sink, used only because the probe above found one.
    audit?.record(order.reference);
  }
  const crypto = provider.getService(Type.tag(t.gateway, 'crypto')) as IPaymentGateway | undefined;
  lines.push(`  getService at key "crypto": ${crypto?.label}`);
  lines.push(`  a keyed registration is not in the bare base's collection: `
    + `${[...provider.getServices(t.gateway)].length} gateways`);

  // ── factory slots ──────────────────────────────────────────────────────────
  //
  // A FACTORY SLOT injects a CALLABLE instead of an instance, and it is the
  // answer to "I need one of these later, with an argument the container cannot
  // know". `Type.func(result, ...callerArgs)` spells it: the listed arguments
  // are the ones the CALLER supplies, and every other slot in the target's
  // signature is resolved from the container as usual.
  //
  // `PaymentRouter` takes exactly that — `mintReceipt: (order) => IReceipt` —
  // which is how the checkout lines above minted their receipts. A parameterized
  // factory builds a fresh instance per call, because the arguments differ every
  // time and a cached one would answer the wrong question.
  lines.push('factory slots — the caller supplies what the container cannot know');
  lines.push(`  mint ${ORDER_C.reference}: ${router.checkout(ORDER_C)}`);
  // The same slot asked for from OUTSIDE a constructor, rather than injected
  // into one.
  lines.push(`  asking the provider for one: ${
    attempted(() => {
      const mint = provider.resolveFactory(t.receipt, [t.order]);
      return (mint(ORDER_C) as IReceipt).text;
    })
  }`);

  // ── async registrations ────────────────────────────────────────────────────
  //
  // Nothing is registered at the bare rates type; the only registration is
  // `Promise<…:IExchangeRates>`, which is the honest way to say "this arrives
  // later". The container hands back the promise it was told about and the
  // caller awaits it — no half-built value ever appears.
  lines.push('async registrations — the promise is the registration');
  const rates = await (provider.getRequiredService(t.ratesPromise) as Promise<IExchangeRates>);
  lines.push(`  rates as of ${rates.asOf}, EUR at ${rates.rate('EUR')}`);
  lines.push(`  the bare type has no registration: ${provider.getService(t.rates)}`);

  // ── the provider as a service ──────────────────────────────────────────────
  //
  // The container can hand back ITSELF: a parameter typed `IServiceProvider`
  // gets the live provider, and `RESOLVER_TYPE` is the type that names it. No
  // registration exists for it — the engine supplies it structurally.
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
  const view = provider.getRequiredService(RESOLVER_TYPE) as IServiceProvider;
  lines.push(`  the injected view IS the live container: ${view === provider}`);

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
  let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
  services = addCheckoutServices(services);
  return await tour(services.build());
}

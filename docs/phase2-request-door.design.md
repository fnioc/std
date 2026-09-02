# Phase 2 — the request door and installed hooks

Steps 5–8 of the di execution order: the request arms, the request as a resolvable address, the
engine's two seeded registrations, and the installed-hooks mechanism. `Behavior`/`Hooks` are reused
as they are.

## Types

`libraries/di.core/src/Request.ts` — the request is an exported abstract class with two exported
inheritors; the arm check everywhere is `instanceof`:

```ts
/** What flows through the middleware chain for one ask. */
export abstract class Request {
  /** The staged-hook handles this ask activated, in activation order. Read by the engine and tests as `request['active']`. */
  private readonly active: Handle[] = [];
  [key: symbol]: unknown;
  constructor(readonly type: Type) {}
  /** Records `handle` as active for this ask and answers the same request — written `next(request.activate(handle))`. */
  activate(handle: Handle): this {
    this.active.push(handle);
    return this;
  }
}
/** An ask a provider opened. */
export class ServiceRequest extends Request {
  constructor(type: Type, readonly serviceProvider: IServiceProvider) {
    super(type);
  }
}
/** An ask a middleware makes at fold time. */
export class ControlRequest extends Request {}
```

There is no union alias, no `DefaultRequest`, no `RequestMembers`, and no arm symbol.
`serviceProvider` lives on `ServiceRequest` only. `active` is TS `private` (not `#`), so the engine
and tests reach it by element access. Requests are minted in exactly two places:
`ServiceProvider.getService` mints `new ServiceRequest(address, this)`, and a middleware's
fold-time control ask mints `next(new ControlRequest(typefor<ControlService>()))`.

`libraries/di.core/src/hooks.ts`, beside `Hooks`:

```ts
/** One installed behavior: its slot in the engine's installed list. Disposing it IS the uninstall. */
export interface Handle extends Disposable {
  /** The installed slot; a request's gate is one comparison against it. */
  readonly index: number;
}
```

`libraries/di.core/src/ControlService.ts` — ONE umbrella control, the engine's own surface reached
through the door:

```ts
export interface ControlService {
  /** The registrations the engine resolves against. The engine's own two rows carry a `null` lifetime. */
  readonly registry: Iterable<Registration<unknown>>;
  /** Installs `hooks` gated: they run only for an ask that activated the handle. */
  stageHooks(hooks: Partial<Behavior>): Handle;
  /** Installs `hooks` always active: they run for every ask, outermost. */
  installHooks(hooks: Partial<Behavior>): Handle;
}
```

There is no `uninstall` verb anywhere — disposing the handle is the uninstall. `Control<T>` and
`controlLifetime` are deleted (`Control.ts` with them), and the separate registry ask goes too:
the umbrella is its own specific address, so no marker wrapper is needed.

`Hooks.Construction.registration` drops its `?`: hooks fire only at registration-carrying nodes.

`Registration`'s lifetime slot is hidden-on-inputs, explicit-on-outputs: the input surfaces
(`Registration.*` factories, the builder, `Manifest.add`) type the slot `Lifetime` — the
`controlLifetime` union member deletes — while the seeded lifetime is `null` at runtime, cast in at
the two seed sites, and admitted by the outputs that can hand a seeded row back (the engine's own
reads; `ControlService.registry`, whose vocabulary is `unknown`). `Hooks.Construction.registration`
stays `Registration<unknown>`, and hooks never fire at a seeded node. The seeded rows are NOT
hidden from the registry.

A middleware installing gated hooks:

```ts
const middleware: Middleware = next => {
  const control = next(new ControlRequest(typefor<ControlService>())) as ControlService;
  const handle = control.stageHooks(new ScopeBehavior(scope));
  return request => next(request.activate(handle));
};
```

There are no helper functions for the fold-time control asks: each caller spells the ask, the
control guard, and (where it wants one) `new Registry(control.registry)` inline. The two validation
addons do exactly that.

## Seeds

The `Engine` constructor appends exactly two registrations AFTER the given ones, so they file
OLDEST and a user registration at the same address shadows them:

```ts
const provider = (request: ServiceRequest): IServiceProvider => new ServiceProvider(inner => request.serviceProvider.getService(inner.type));
const control = (): ControlService => this.#hooks;
// ...
Registration.factory(typefor<IServiceProvider>(), provider, typefor(provider), null),
Registration.factory(typefor<ControlService>(), control, typefor(control), null),
```

The engine also keeps the two rows in an identity set (`Engine.isSeeded`), which is what the
dispatch keys seed-ness on — a user registration that happens to carry a `null` lifetime is not
the engine's, and hooks fire at and beneath it.

The provider factory mints a fresh provider wrap per handout, forwarding every ask to the minting
request's provider — provider identity is never a contract, and the handed-out view is never the
container object. Seeded registrations plan their slots like any other: the provider seed's
`ServiceRequest` slot lowers through `lowerArg` to a `RequestPlan`.

## The request as an address

The request is NOT registered. The planner answers a slot naming `Request`, `ServiceRequest` or
`ControlRequest` with a new plan kind:

```ts
export interface RequestPlan {
  readonly kind: 'request';
  readonly address: Type;
}
```

`PlannerVisitor.visitImported` answers the three request addresses with `Plan.request(type)` —
synthesis, so a user registration at one of those addresses still answers first. The realize
visitor answers the request in flight when it is an instance of the asked arm — the base class
answers any — and otherwise throws `UnsatisfiableError`:

```ts
protected visitRequest(plan: RequestPlan): any {
  const request = this.#request;
  const arm = plan.address === typefor<ServiceRequest>() ? ServiceRequest
    : plan.address === typefor<ControlRequest>() ? ControlRequest
    : Request;
  if (request instanceof arm) {
    return request;
  }
  throw new UnsatisfiableError(plan.address, 'the ask in flight is not an instance of the asked request class');
}
```

No sentinel value, no per-ask registry: addresses are fixed at build, only the answer arrives per
ask, so `Plan.from`'s per-registry memo never invalidates.

## Shadowing resolves beneath

A registration whose own slot names its own address — a factory for `Foo` shaped `Func<[Foo], Foo>`
— gets the SHADOWED (older) registration as that dependency: matching for a self-named slot starts
after the registration being planned. Decoration with no verb. No older match is unsatisfiable
(throws, never delegates). A collection ask still enumerates every match, decorator and shadowed
both. The cycle guard still catches real cycles through a third address.

Mechanics: `Match` carries the matched registration's position in the registry;
`Registry.getMatches` takes an optional start position; `Plan.fromMatch` hands `lowerSignature` a
visitor view whose `visit` routes an arg equal to the plan's own populated address to
`PlannerVisitor.visitBeneath(address, position)`, which searches only older registrations and skips
the cycle guard for that one address (the nesting terminates because the position strictly grows).

## Engine

`Engine.getService` keeps only the `TypeError` guard, `Plan.from`, delegate to `next` when no
registration matches (`!registry.hasMatch`), else `Plan.realize`. The registry-control branch,
`#controlLifetimeAddresses` and `#resolveControlLifetime` delete.

The engine holds one `InstalledHooks` (internal, `libraries/di/src/internal/Plan/InstalledHooks.ts`),
which implements `ControlService`:

```ts
interface Entry {
  readonly behavior: Partial<Behavior>;
  readonly staged: boolean;
  // Read once at install: absent when the hook is, else whether it is middleware (arity above the handler's).
  readonly beginResolve?: boolean;
  readonly beforeConstruct?: boolean;
  readonly canonicalize?: boolean;
  readonly afterConstruct?: boolean;
}
export class InstalledHooks implements ControlService {
  readonly #entries: (Entry | undefined)[] = []; // only grows; disposing a handle empties its slot, never reuses it
  #always: Always; // rebuilt by install/dispose, never per ask
}
```

`AlwaysDispatch` is the precomputed always-active dispatch: per hook kind, the participating
entries with their state indices in install order, plus the always-active count. Install and
dispose are cold — an always-tier install or dispose rebuilds the precomputation once, a staged
one only files or empties its slot; nothing on the ask path installs, splices or checks for
removal, and dispatch walks only what is active.

## Dispatch

`Plan.realize(plan, options)` routes through `RealizeVisitor.realize(plan, context)` — the door:

1. Root suppression: a `registered-ctor`/`-factory`/`-promise` root whose registration is one of
   the engine's two seeded rows (by identity) opens no dispatch — no `beginResolve`, no arrays.
2. Snapshot `always = installed.always` (an install during the ask builds a new object; this ask
   keeps its own) and `active = request['active']`.
3. `always.count === 0 && active.length === 0`: plain `visit` — the no-hooks path allocates
   nothing beyond it.
4. Else `states = new Array(always.count + active.length)`; one `beginResolve` pass fills it —
   the always entries first (each at its own state index), then `active` by position `j` at
   `always.count + j`.
5. When no construction-kind hook participates in the ask — nothing in the always lists and no
   activated staged entry carries one — the walk runs without `states` on the context, so every
   node takes the plain path and no hook can observe the difference.
6. Else `visit(plan, { ...context, states })` — `VisitorContext` gains `readonly states?`,
   threaded immutably, copy-on-write only when a `beforeConstruct` answers `{ state }`.

Gate check, per activated handle: an emptied slot is skipped; an `installHooks` handle is not
staged and already ran in the always set, so it is skipped too; a handle whose entry lacks the
kind is skipped. Walk order per kind: the always entries in install order, then `active` in
activation order; a middleware-form hook's `next` stands for everything later in that order, so
trailing-`next` hooks nest in activation order.

- `beginResolve`: at the door, once per realize entry (`getService`, `resolveFrame`,
  `resolveLatebound` each open one). Handler: `states[i] = fn(request, undefined)`; middleware:
  `next` runs the later layers' `beginResolve` and the return fills `states[i]`.
- `beforeConstruct`: at `visitRegisteredCtor`/`Factory`/`Promise` only, and never at one of the
  engine's seeded rows. `{ result }` stands for the construction — args
  unrealized, `canonicalize`/`afterConstruct` skipped, later layers never run. `{ state }`
  redirects that behavior's slot for the subtree.
- construct: the node's call under the (possibly redirected) states.
- `canonicalize`: reverse walk, so the outermost proxy ends outermost; only where the engine built.
- `afterConstruct`: same reverse order; skipped when a `beforeConstruct` answered a result —
  "after" means after a construction happened.

Hooks fire ONLY at registration-carrying nodes, never at engine-synthesised ones. The consumer a
hook sees is the NEAREST REGISTERED ANCESTOR — synthesised glue is skipped, so a singleton
consuming a tuple holding another registered service is the consumer of that service; the
immutable context threading gives this structurally, since synthesised nodes never derive a
context of their own.

A hook receives `Hooks.Construction`: `node` = the plan node (stable, opaque), `populatedAddress`
and `registration` from the plan, `state = states[i]` — one carrier per participating behavior per
hooked node, since the contract isolates each behavior's state.

Arity: read once at install; dispatch reads a boolean. The chain never seals: a scope factory
wraps a new layer over the folded chain at any time, and hooks install at any time.

Fork guarantee: the only gated source is `request['active']`, filled by the layers this ask
traversed; a sibling wrap over the same folded chain pushed nothing onto it, so an ask through one
never runs the other's staged hooks, while installed hooks run for both, outermost.

Latebound guarantee: `visitLateBound`/`visitInvoker` close over the minting request; re-entry
through `resolveLatebound`/`resolveFrame` reaches the door with THAT request and reads its
activation list — the minting traversal's — under the always set as installed at invocation time.

Allocations per ask: no hooks — none beyond the door's two length reads and one root check. With
hooks — `states`, the derived context, and per hooked node one carrier per participating behavior
plus one `next` closure per middleware-form hook called. The loops allocate nothing; `activate`
pushes into the request's own array.

## Delegation

No registration → `next`; registered but unbuildable → throw. Beneath the engine only the terminus
stands. `Registry.getMatches` stays on `bindGenerics` as it is.

## Changes

- `di.core/src/Request.ts`: the abstract class and its two inheritors.
- `di.core/src/hooks.ts`: `Handle`; `Construction.registration` required.
- `di.core/src/ControlService.ts`: new.
- `di.core/src/Control.ts`: deleted; `Registration.ts` drops the `controlLifetime` union member.
- `di.core/README.md`, `di/README.md`: `Request`/`ServiceRequest`/`ControlRequest`,
  `ControlService`, `Handle` rows.
- New: `di/src/internal/Plan/InstalledHooks.ts`.
- `di/src/internal/Engine.ts`: the two seeds; the control branches delete; holds one
  `InstalledHooks`.
- `Plan/Plan.ts`: `RequestPlan` + `Plan.request`; the beneath-aware visitor view in `fromMatch`.
- `Plan/PlannerVisitor.ts`: the request addresses in `visitImported`; `visitBeneath`.
- `Plan/RealizeVisitor.ts`: the `realize` door, `visitRequest`, `states`, hook dispatch on the
  three registered visits.
- `di/src/internal/Registry.ts`: `Match.index`; `getMatches` start position.
- `di/src/ServiceProvider.ts`: mints `ServiceRequest`.
- `di/src/internal/closed-address-plans.ts`: `registryOf` deletes.
- `di/src/addons/validation.ts`: each addon inlines the control ask, the guard, and
  `new Registry(control.registry)`.
- `tests/di.test/test/{engine-delegation,realize-visitor,planner-visitor,validation-addon}.test.ts`:
  real request instances; the registry pin widens to given-plus-seeds.
- `docs/libraries/di.md`, `docs/features/*.md` where the door or hooks are described.

## Tests

Engine delegation (no match → `next`; unbuildable → throws). The arm check (a `ServiceRequest`
slot under a control ask refuses; a base `Request` slot answers either). The provider answered by
reference to the minting request's provider, as a fresh view. A user `IServiceProvider`
registration shadowing the seed. Shadowing-resolves-beneath (`Func<[Foo], Foo>` gets the older
`Foo`; no older = throws; a collection enumerates both; a real cycle still throws `CycleError`).
Staged vs installed hooks across two parallel scope layers over one base chain; dispose
un-installs; a latebound created inside a layer and invoked later still runs that layer's hooks;
hooks never fire at a synthesised node; `afterConstruct` skipped on a `beforeConstruct` answer.
The two seeded rows carry `null` lifetime and are visible through `ControlService.registry`. The
example app under `examples/` resolves again.

Gate: `tsc --noEmit -p tsconfig.ci.json` for di, di.core, di.test;
`BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test` from `tests/di.test`, same 18 lifetime-model load
failures and 6 skips as the base.

## Open

- `beginResolve`'s `injected` is `undefined` at the door; a non-`undefined` value arises only from
  an earlier layer's middleware calling `next(request, X)`. A `{ state }` redirect does not
  survive a latebound re-entry (fresh door, fresh `states`).
- The demoted make inside a `registered-promise` envelope realizes as a plain node; the hooks run
  at the envelope node, whose product is the promise.
- One `Hooks.Construction` carrier per behavior per hooked node is the one per-node allocation the
  hook contract forces.

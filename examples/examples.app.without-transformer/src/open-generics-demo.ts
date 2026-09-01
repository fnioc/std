// OPEN GENERICS, manual dialect — one registration, unbounded closings.
//
// The SAME scenario as ../../examples.app.with-transformer/src/
// open-generics-demo.ts, hand-wired with plain `tsc`: every service type is
// composed here by name, and every dependency signature is spelled out. The two
// files print byte-identical lines, which is the point — the type-driven dialect
// is sugar for exactly this and adds nothing.
//
// The problem being solved: a persistence layer with N entity types should not
// need N repository registrations. Register the repository ONCE against a type
// that still has a HOLE in it — `IRepository<$1>` — and the container mints a
// closed registration on demand for whichever closing is asked for. Adding a
// fourth entity later costs one `Seed<T>` value and nothing else.
//
// THE HOLE IS A PLACEHOLDER TYPE. `Type.generic(label)` composes one, and
// `Type.imported(base, from, [hole])` puts it where a type argument goes. Where the
// type-driven dialect writes the compile-time brand `Generic<'TEntity'>` (or
// `Generic<'TEntity', Entity>` where the surrounding type constrains it), this
// file composes the same value directly — the brand exists so a transformer can
// derive it, and with no transformer there is nothing to derive.
//
// WHAT AN OPEN TEMPLATE MAY LOOK LIKE. ONE hole anywhere in the service type is
// enough; the remaining type arguments may be concrete. `IRepository<$1>` and
// `IJoin<$1,$2>` are templates, and so is the PARTIALLY-OPEN `IJoin<Order,$2>`
// registered further down — it pins the left type argument and stays generic in
// the right, which is what lets an implementation that genuinely needs to know
// ONE of its type arguments still serve every closing of the others.
//
// Two templates over one base therefore OVERLAP, and both of them match. The
// container settles that the same way it settles two registrations of one plain
// type: the MOST RECENTLY REGISTERED match wins. So a pinned template has to be
// registered AFTER the general one it is meant to override, and the ordering
// below says so at the call site.
//
// A hole's label distinguishes it from its siblings. `$1` and `$2` bind
// independently; the same label appearing twice in one registration binds to one
// captured type wherever it appears.

import { Builder } from '@rhombus-std/di';
import { type Addon, Manifest } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

import type { AuditEvent, Entity, IJoin, IRepository, ITable, Order, Seed, User } from '@rhombus-std/examples.contracts';

/** No lifetime model is installed here; a vacuous addon opens the builder's vocabulary with nothing. */
const noLifetimeModel: Addon<unknown> = { registrations: [], middleware: next => next };

// ── the service types, composed as the transformer derives them ─────────────
//
// `Type.imported(name, from, args)` renders `<import-specifier>:<exported-name>`
// for a package-public type and `base<arg>` for a closing. Composing them the
// same way is what lets this app behave identically to the type-driven one —
// and, more usefully, what lets a manual consumer interoperate with a library
// that was authored from types.

const CONTRACTS = '@rhombus-std/examples.contracts';

const USER_TYPE = Type.imported('User', CONTRACTS);
const ORDER_TYPE = Type.imported('Order', CONTRACTS);
const AUDIT_EVENT_TYPE = Type.imported('AuditEvent', CONTRACTS);

/** `Seed<T>` — the closed value each closing bottoms out at. */
function seedOf(entity: Type): Type {
  return Type.imported('Seed', CONTRACTS, [entity]);
}

/** `ITable<T>` — the middle link. */
function tableOf(entity: Type): Type {
  return Type.imported('ITable', CONTRACTS, [entity]);
}

/** `IRepository<T>` — the type a consumer actually asks for. */
function repositoryOf(entity: Type): Type {
  return Type.imported('IRepository', CONTRACTS, [entity]);
}

/** `IJoin<L,R>` — the arity-2 type the two-hole template serves. */
function joinOf(left: Type, right: Type): Type {
  return Type.imported('IJoin', CONTRACTS, [left, right]);
}

/**
 * `Typeof<T>` — a slot that receives the TYPE of a closing rather than an
 * instance of it. It is an ordinary service type carrying an ordinary value
 * registration; what makes it useful is that a template's signature can name
 * `Typeof<$1>` and have the hole substituted per closing.
 */
function witnessOf(entity: Type): Type {
  return Type.imported('Typeof', '@rhombus-std/di.core', [entity]);
}

// The open TEMPLATES. A hole is a placeholder type, and it is matched
// positionally against the closing's arguments — `$1` in `IJoin<$1,$2>` binds
// the first argument wherever else `$1` appears in that registration.
const HOLE_1 = Type.generic('1');
const HOLE_2 = Type.generic('2');

const TABLE_TEMPLATE = tableOf(HOLE_1);
const REPOSITORY_TEMPLATE = repositoryOf(HOLE_1);
const JOIN_TEMPLATE = joinOf(HOLE_1, HOLE_2);
// The partially-open one. A concrete argument and a hole compose exactly the
// same way two holes do — there is nothing special about the mixed form, which
// is why it needed no new grammar to allow.
const ORDER_JOIN_TEMPLATE = joinOf(ORDER_TYPE, HOLE_2);

// ── the data each closing bottoms out at ────────────────────────────────────

// Registered CLOSED, one value per entity: `Seed<User>`, `Seed<Order>`,
// `Seed<AuditEvent>` are three ordinary registrations with no holes in them.
// They are the floor of the template's recursion.
const USER_SEED: Seed<User> = { rows: [{ id: 'u-1', name: 'Ada' }, { id: 'u-2', name: 'Grace' }] };
const ORDER_SEED: Seed<Order> = { rows: [{ id: 'o-1', total: 19 }, { id: 'o-2', total: 5 }, { id: 'o-3', total: 42 }] };
const AUDIT_SEED: Seed<AuditEvent> = { rows: [{ id: 'a-1', action: 'login' }, { id: 'a-2', action: 'export' }] };

// ── the implementations ─────────────────────────────────────────────────────

/**
 * The middle link. Registered as the open template `ITable<$1>`, so it is only
 * ever reached as a closed dependency of a closed repository.
 *
 * Both of its parameters carry the hole, in the two different ways a parameter
 * can:
 *   - `seed` is an ordinary dependency whose TYPE contains the hole
 *     (`Seed<$1>`), substituted per closing into `Seed<User>`;
 *   - `entityType` is a witness rather than an instance — the slot names
 *     `Typeof<$1>`, so the substitution hands the class the very type its
 *     closing bound. That is how a generic implementation learns which closing
 *     it is, which it otherwise cannot know: a type parameter is erased, so
 *     there is nothing to reflect on at run time.
 */
class InMemoryTable<TEntity> implements ITable<TEntity> {
  readonly #seed: Seed<TEntity>;
  public readonly entityToken: string;

  public constructor(seed: Seed<TEntity>, entityType: Type) {
    this.#seed = seed;
    this.entityToken = Type.stringify(entityType);
  }

  public rows(): readonly TEntity[] {
    return this.#seed.rows;
  }
}

/**
 * The template a consumer actually asks for. `TEntity extends Entity` is the
 * bound that the type-driven dialect spells `Generic<'1', Entity>`; composing a
 * placeholder by hand carries no type-level constraint at all, so the bound is
 * simply the class's own business.
 */
class InMemoryRepository<TEntity extends Entity> implements IRepository<TEntity> {
  readonly #table: ITable<TEntity>;
  public readonly entityToken: string;

  public constructor(table: ITable<TEntity>, entityType: Type) {
    this.#table = table;
    this.entityToken = Type.stringify(entityType);
  }

  public all(): readonly TEntity[] {
    return this.#table.rows();
  }

  public describe(): string {
    const ids = this.all().map((row) => row.id).join(', ');
    return `${shortName(this.entityToken)} -> ${ids}`;
  }
}

/**
 * The escape hatch. Audit rows must never leave the process with their ids
 * attached, so `AuditEvent` gets its own implementation registered at the CLOSED
 * type `IRepository<AuditEvent>`. It is registered AFTER the template, so it
 * wins that one closing and the template still serves every other entity — the
 * reason you can adopt a template without giving up per-type behaviour.
 *
 * It depends on `ITable<AuditEvent>`, which is itself minted from the `ITable`
 * template: an exact registration and an open one compose freely.
 */
class AuditRepository implements IRepository<AuditEvent> {
  readonly #table: ITable<AuditEvent>;
  public readonly entityToken: string;

  public constructor(table: ITable<AuditEvent>) {
    this.#table = table;
    this.entityToken = table.entityToken;
  }

  public all(): readonly AuditEvent[] {
    return this.#table.rows();
  }

  public describe(): string {
    return `${shortName(this.entityToken)} -> ${this.#table.rows().length} event(s), ids redacted`;
  }
}

/**
 * An ARITY-2 template. Holes are labelled, not positional wildcards: `$1` and
 * `$2` bind independently, and each side then resolves through the ordinary
 * precedence rules — so asking for `IJoin<User,AuditEvent>` gets a
 * template-minted left side and the exact `AuditRepository` on the right.
 */
class RepositoryJoin<TLeft extends Entity, TRight extends Entity> implements IJoin<TLeft, TRight> {
  public constructor(public readonly left: IRepository<TLeft>, public readonly right: IRepository<TRight>) {}

  public describe(): string {
    return `${shortName(this.left.entityToken)} (${this.left.all().length}) `
      + `joined with ${shortName(this.right.entityToken)} (${this.right.all().length})`;
  }
}

/**
 * The PARTIALLY-OPEN template — `IJoin<Order,$2>`, one argument pinned and one
 * still a hole.
 *
 * The reason to reach for one is right here in the class: summing `.total` is
 * only possible because `TLeft` is `Order` and nothing else, while the right
 * side has no such requirement and stays generic. A fully-open template could
 * not be written this way, and writing one join implementation per pair would
 * put the registration count back where templates were meant to keep it down.
 *
 * It OVERLAPS `IJoin<$1,$2>` — both match `IJoin<Order,User>` — so it is
 * registered after it, and takes that closing for being the later match.
 */
class OrderJoin<TRight extends Entity> implements IJoin<Order, TRight> {
  public constructor(public readonly left: IRepository<Order>, public readonly right: IRepository<TRight>) {}

  public describe(): string {
    const orders = this.left.all();
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    return `${shortName(this.left.entityToken)} (${orders.length}, total ${total}) `
      + `joined with ${shortName(this.right.entityToken)} (${this.right.all().length})`;
  }
}

/**
 * The tail of a rendered type, so a report line reads the same in both authoring
 * dialects — they compose their types from the same declarations, and printing
 * the tail keeps the line about the ENTITY rather than about the spelling.
 */
function shortName(token: string): string {
  return token.slice(token.lastIndexOf(':') + 1);
}

// ── the registrations ───────────────────────────────────────────────────────
//
// Kept at module top level, the shape a composition root has. The manifest is
// IMMUTABLE — every verb returns a NEW manifest — so each call is threaded back
// into `manifest`; a bare `manifest.add(...)` statement would register
// nothing.

let manifest: Manifest<unknown> = Manifest.empty<unknown>();

// The closed value registrations the templates bottom out at: one seed and one
// type witness per entity. Nothing generic about them — they are the floor.
for (const entity of [USER_TYPE, ORDER_TYPE, AUDIT_EVENT_TYPE]) {
  manifest = manifest.add(witnessOf(entity), entity);
}
manifest = manifest.add(seedOf(USER_TYPE), USER_SEED);
manifest = manifest.add(seedOf(ORDER_TYPE), ORDER_SEED);
manifest = manifest.add(seedOf(AUDIT_EVENT_TYPE), AUDIT_SEED);

// Template 1 — `ITable<$1>`. Its signature is where the hole propagates: the
// first slot is a type CONTAINING `$1`, the second is the `Typeof<$1>` witness.
// Both are rewritten per closing before the class is constructed.
manifest = manifest.add(TABLE_TEMPLATE, InMemoryTable, Type.ctor(TABLE_TEMPLATE, [[seedOf(HOLE_1), witnessOf(HOLE_1)]]), 'singleton');

// Template 2 — `IRepository<$1>`, the one a consumer asks for. Its dependency is
// itself a template closing, so resolving `IRepository<User>` closes
// `ITable<$1>` to `ITable<User>` on the way down.
manifest = manifest.add(REPOSITORY_TEMPLATE, InMemoryRepository, Type.ctor(REPOSITORY_TEMPLATE, [[tableOf(HOLE_1), witnessOf(HOLE_1)]]), 'singleton');

// The one exact override, registered AFTER the template it overrides. It is
// filed at a fully CLOSED type, so it can only ever match `AuditEvent` — the
// template still serves every other entity.
manifest = manifest.add(repositoryOf(AUDIT_EVENT_TYPE), AuditRepository, Type.ctor(repositoryOf(AUDIT_EVENT_TYPE), [[tableOf(AUDIT_EVENT_TYPE)]]), 'singleton');

// Template 3 — fully open, arity 2. Each dependency names a DIFFERENT hole, so
// the two sides close independently.
manifest = manifest.add(JOIN_TEMPLATE, RepositoryJoin, Type.ctor(JOIN_TEMPLATE, [[repositoryOf(HOLE_1), repositoryOf(HOLE_2)]]), 'singleton');

// Template 4 — PARTIALLY OPEN, and registered after the general one on purpose.
// The service type pins the left argument (`IJoin<Order,$2>`) and so does the
// left dependency argument; only the right one carries a hole. Both templates
// match a join whose left side is an order, and the later registration is the
// one that takes it.
manifest = manifest.add(ORDER_JOIN_TEMPLATE, OrderJoin, Type.ctor(ORDER_JOIN_TEMPLATE, [[repositoryOf(ORDER_TYPE), repositoryOf(HOLE_2)]]), 'singleton');

// ── the demonstration ───────────────────────────────────────────────────────

/**
 * Resolves several closings of the templates registered above and yields the
 * report as lines. Yields rather than prints so the caller owns the output.
 *
 * Deliberately order-stable: fixed seed rows, no timestamps, no iteration over
 * an unordered collection.
 */
export function* demonstrateOpenGenerics(): Generator<string> {
  const app = Builder.useAddon(noLifetimeModel).withServices(() => manifest).build();

  // Two closings of ONE registration. Neither type was ever registered.
  const users = app.resolve(repositoryOf(USER_TYPE)) as IRepository<User>;
  const orders = app.resolve(repositoryOf(ORDER_TYPE)) as IRepository<Order>;

  // The middle template, resolved directly. Its `entityToken` came from the
  // `Typeof<$1>` slot, filled in with the type this closing was minted for.
  const userTable = app.resolve(tableOf(USER_TYPE)) as ITable<User>;

  // The exact registration for the one entity that needed different behaviour.
  const audit = app.resolve(repositoryOf(AUDIT_EVENT_TYPE)) as IRepository<AuditEvent>;

  // Arity 2: the left hole closes onto the template, the right onto the exact
  // registration.
  const join = app.resolve(joinOf(USER_TYPE, AUDIT_EVENT_TYPE)) as IJoin<User, AuditEvent>;

  // Two closings over ONE base that two different templates could serve.
  // `IJoin<Order,User>` matches both `IJoin<Order,$2>` and `IJoin<$1,$2>`, and
  // the pinned one was registered later, so it takes it. `IJoin<AuditEvent,User>`
  // matches only the general template, which still serves it.
  const pinnedJoin = app.resolve(joinOf(ORDER_TYPE, USER_TYPE)) as IJoin<Order, User>;
  const generalJoin = app.resolve(joinOf(AUDIT_EVENT_TYPE, USER_TYPE)) as IJoin<AuditEvent, User>;

  // A hole is not a service: matching runs against a request that has to be
  // fully closed, so asking for the template itself is refused rather than
  // answered with one arbitrary closing.
  let templateOutcome = 'unexpectedly resolved';
  try {
    app.resolve(REPOSITORY_TEMPLATE);
  } catch (error) {
    templateOutcome = `was refused (${(error as Error).name})`;
  }

  yield '=== di open generics — without transformer ===';
  yield 'IRepository<$1> is registered ONCE; every closing below is minted from it:';
  yield `  IRepository<User>: ${users.describe()}`;
  yield `  IRepository<Order>: ${orders.describe()}`;
  yield 'the closing propagates down the graph — IRepository<T> -> ITable<T> -> Seed<T>:';
  yield `  ITable<User> reports the closing it was minted for: ${shortName(userTable.entityToken)}`;
  yield `  IRepository<User>.all() is the array registered as Seed<User>: ${Object.is(users.all(), USER_SEED.rows)}`;
  yield 'a CLOSED registration serves the one closing it names:';
  yield `  IRepository<AuditEvent>: ${audit.describe()}`;
  yield 'arity 2 — $1 and $2 close independently, each side keeping its own precedence:';
  yield `  IJoin<User,AuditEvent>: ${join.describe()}`;
  yield 'a template may pin some arguments; where two overlap, the later registration wins:';
  yield `  IJoin<Order,User> goes to the pinned IJoin<Order,$2>: ${pinnedJoin.describe()}`;
  yield `  IJoin<AuditEvent,User> goes to the general IJoin<$1,$2>: ${generalJoin.describe()}`;
  yield 'the template itself is NOT resolvable — a hole is not a service:';
  yield `  asking for IRepository<$1> ${templateOutcome}`;
}

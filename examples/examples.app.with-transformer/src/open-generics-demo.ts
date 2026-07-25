// OPEN GENERICS, tokenless dialect — one registration, unbounded closings.
//
// The problem: a persistence layer with N entity types should not need N
// repository registrations. Register the repository ONCE against a token that
// still has a HOLE in it — `IRepository<$1>` — and the container mints a closed
// registration on demand for whichever closing is asked for. Adding a fourth
// entity later costs one `Seed<T>` value and nothing else.
//
// Authored with @rhombus-std/di.extras, so the tokens are DERIVED. A generic
// implementation is registered as an INSTANTIATION EXPRESSION —
// `addClass<ITable<$<1>>>(InMemoryTable<$<1>>)` — because that is what binds the
// class's own type parameter to the hole; a bare `InMemoryTable` would leave
// `TEntity` unbound and its dependency slots underivable. The type arguments are
// compile-time only and are stripped from the emitted call, which lowers to
// exactly the hand-written form in ../../examples.app.without-transformer/src/
// open-generics-demo.ts. Diff the two files: same scenario, same output, only
// the dialect differs.
//
// TWO SPELLINGS OF A HOLE appear below, and the choice between them is not
// cosmetic:
//   $<1>            the general form, `Hole<1>` — an UNCONSTRAINED hole. This is
//                   the one spelling of a bare hole in TYPE position. (`$1`
//                   without brackets is the same hole's WIRE text, i.e. what it
//                   looks like inside a token STRING like "pkg:IRepo<$1>" — a
//                   different grammar, and never a type.)
//   Hole<1, Entity> a CONSTRAINED hole. `InMemoryRepository<TEntity extends
//                   Entity>` needs `.id`, so its type argument must satisfy that
//                   bound — and a bare `$<1>` (unconstrained) does not. The second
//                   parameter is the constraint carrier: `Hole<1, Entity>` IS an
//                   `Entity`, so the bound is met while the hole survives.
//
// WHAT AN OPEN TEMPLATE MAY LOOK LIKE. ONE hole anywhere in the service token is
// enough; the remaining type arguments may be concrete. `IRepository<$<1>>` and
// `IJoin<$<1>,$<2>>` are templates, and so is the PARTIALLY-OPEN
// `IJoin<Order,$<2>>` registered further down — it pins the left type argument
// and stays generic in the right, which is what lets an implementation that
// genuinely needs to know ONE of its type arguments still serve every closing of
// the others.
//
// Two templates over one base therefore OVERLAP, and the container picks between
// them MOST-SPECIFIC-FIRST rather than by whoever registered last. A concrete
// argument narrows a template, and so does a repeated hole label — a template
// spelled `IPair<$<1>,$<1>>` matches only closings whose two arguments are
// equal. The narrowest match wins, and only a tie falls back to registration
// order. That is why the pinned join below can be registered BEFORE the general
// one and still win.

import { OpenTokenResolutionError, ServiceManifest } from '@rhombus-std/di';
// The compile-time authoring brands. They have zero runtime footprint — this
// import erases — and reaching them through di.extras is the documented idiom: a
// single dependency brings both the lowering and the brands into scope.
import type { $, Hole, Typeof } from '@rhombus-std/di.extras';

import type { AuditEvent, Entity, IJoin, IRepository, ITable, Order, Seed,
  User } from '@rhombus-std/examples.contracts';

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
 *   - `seed: Seed<TEntity>` is an ordinary dependency whose TOKEN contains the
 *     hole (`…:Seed<$1>`), substituted per closing into `…:Seed<User>`;
 *   - `entityToken: Typeof<TEntity>` is not a dependency at all — it asks for
 *     the TOKEN STRING of the type argument. That is how a generic
 *     implementation learns which closing it is, which it otherwise cannot know:
 *     a type parameter is erased, so there is nothing to reflect on at runtime.
 */
class InMemoryTable<TEntity> implements ITable<TEntity> {
  readonly #seed: Seed<TEntity>;
  public readonly entityToken: string;

  public constructor(seed: Seed<TEntity>, entityToken: Typeof<TEntity>) {
    this.#seed = seed;
    this.entityToken = entityToken;
  }

  public rows(): readonly TEntity[] {
    return this.#seed.rows;
  }
}

/**
 * The template a consumer actually asks for. `TEntity extends Entity` is why the
 * registration below spells its hole `Hole<1, Entity>` rather than `$<1>`:
 * `describe()` reads `.id` off each row, so the skolem has to satisfy the bound.
 */
class InMemoryRepository<TEntity extends Entity> implements IRepository<TEntity> {
  readonly #table: ITable<TEntity>;
  public readonly entityToken: string;

  public constructor(table: ITable<TEntity>, entityToken: Typeof<TEntity>) {
    this.#table = table;
    this.entityToken = entityToken;
  }

  public all(): readonly TEntity[] {
    return this.#table.rows();
  }

  public describe(): string {
    const ids = this.all().map((row) => row.id).join(', ');
    return `${this.entityToken} -> ${ids}`;
  }
}

/**
 * The escape hatch. Audit rows must never leave the process with their ids
 * attached, so `AuditEvent` gets its own implementation registered at the CLOSED
 * token `IRepository<AuditEvent>`. An exact registration outranks the template,
 * so this one wins for that single closing and the template still serves every
 * other entity — the reason you can adopt a template without giving up
 * per-type behaviour.
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
    return `${this.entityToken} -> ${this.#table.rows().length} event(s), ids redacted`;
  }
}

/**
 * An ARITY-2 template. Holes are numbered, not positional wildcards: `$<1>` and
 * `$<2>` bind independently, and each side then resolves through the ordinary
 * precedence rules — so asking for `IJoin<User,AuditEvent>` gets a
 * template-minted left side and the exact `AuditRepository` on the right.
 */
class RepositoryJoin<TLeft, TRight> implements IJoin<TLeft, TRight> {
  public constructor(public readonly left: IRepository<TLeft>, public readonly right: IRepository<TRight>) {}

  public describe(): string {
    return `${this.left.entityToken} (${this.left.all().length}) `
      + `joined with ${this.right.entityToken} (${this.right.all().length})`;
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
 * It OVERLAPS `IJoin<$<1>,$<2>>` — both could serve `IJoin<Order,User>` — and
 * wins that closing by being the more specific of the two.
 */
class OrderJoin<TRight> implements IJoin<Order, TRight> {
  public constructor(public readonly left: IRepository<Order>, public readonly right: IRepository<TRight>) {}

  public describe(): string {
    const orders = this.left.all();
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    return `${this.left.entityToken} (${orders.length}, total ${total}) `
      + `joined with ${this.right.entityToken} (${this.right.all().length})`;
  }
}

// ── the registrations ───────────────────────────────────────────────────────
//
// Kept at module top level, the shape a composition root has. The manifest is
// IMMUTABLE — every verb returns a NEW manifest — so each call is threaded back
// into `manifest`; a bare `manifest.addClass(...)` statement would register
// nothing.

let manifest = new ServiceManifest();

// The three closed value registrations the templates bottom out at. Nothing
// generic about them: `addValue<Seed<User>>` derives the ordinary closed token
// `…:Seed<…:User>`.
manifest = manifest.addValue<Seed<User>>(USER_SEED);
manifest = manifest.addValue<Seed<Order>>(ORDER_SEED);
manifest = manifest.addValue<Seed<AuditEvent>>(AUDIT_SEED);

// Template 1 — `ITable<$1>`, spelled with the general `$<1>`. The instantiation
// expression `InMemoryTable<$<1>>` binds the class's own `TEntity` to the hole,
// which is what makes its `Seed<TEntity>` parameter derive the hole-carrying
// token `…:Seed<$1>` instead of failing on an unbound type parameter.
manifest = manifest.addClass<ITable<$<1>>>(InMemoryTable<$<1>>).as<'singleton'>();

// Template 2 — `IRepository<$1>`, the one a consumer asks for. Its hole is
// CONSTRAINED (`Hole<1, Entity>`) because the implementation's type parameter
// is: swap in a bare `$<1>` here and the instantiation expression stops
// type-checking.
manifest = manifest.addClass<IRepository<Hole<1, Entity>>>(InMemoryRepository<Hole<1, Entity>>).as<'singleton'>();

// The one exact override. Registered at a fully CLOSED token, so it takes
// precedence over template 2 for `AuditEvent` and only for `AuditEvent`.
manifest = manifest.addClass<IRepository<AuditEvent>>(AuditRepository).as<'singleton'>();

// Template 3 — PARTIALLY OPEN, and registered FIRST on purpose. `IJoin<Order,
// $<2>>` pins the left type argument and leaves the right a hole. Under a
// last-wins rule this ordering would bury it under the general template below;
// under most-specific-first it costs nothing, because a concrete argument is
// what decides.
manifest = manifest.addClass<IJoin<Order, $<2>>>(OrderJoin<$<2>>).as<'singleton'>();

// Template 4 — fully open, arity 2. Each hole gets its own label; nothing about
// `$<1>` makes it "the first" beyond the number written in it. It serves every
// join the pinned template above declines.
manifest = manifest.addClass<IJoin<$<1>, $<2>>>(RepositoryJoin<$<1>, $<2>>).as<'singleton'>();

// The ONE hand-written token in this file. There is no point asking the
// container for a template — the token still has a hole in it, so there is
// nothing to construct — and the line below exists purely to show that the
// engine says so out loud rather than resolving something surprising.
const REPOSITORY_TEMPLATE = '@rhombus-std/examples.contracts:IRepository<$1>';

// ── the demonstration ───────────────────────────────────────────────────────

/**
 * Resolves several closings of the templates registered above and returns the
 * report as lines. Returns rather than prints so the caller owns the output.
 *
 * Deliberately order-stable: fixed seed rows, no timestamps, no iteration over
 * an unordered collection.
 */
export function demonstrateOpenGenerics(): readonly string[] {
  // Registrations are `singleton`, so a frame has to be open for them to have
  // an owner to cache in; the provider straight from `build()` is frameless and
  // would resolve everything transiently.
  const app = manifest.build().createScope('singleton');
  try {
    // Two closings of ONE registration. Neither token was ever registered.
    const users = app.resolve<IRepository<User>>();
    const orders = app.resolve<IRepository<Order>>();

    // The middle template, resolved directly. Its `entityToken` came from the
    // `Typeof<TEntity>` parameter, filled in by the engine with the argument
    // this closing was minted for.
    const userTable = app.resolve<ITable<User>>();

    // The exact registration for the one entity that needed different
    // behaviour.
    const audit = app.resolve<IRepository<AuditEvent>>();

    // Arity 2: the left hole closes onto the template, the right onto the exact
    // registration.
    const join = app.resolve<IJoin<User, AuditEvent>>();

    // Two closings over ONE base that two different templates could serve.
    // `IJoin<Order,User>` matches both `IJoin<Order,$2>` and `IJoin<$1,$2>`, and
    // the pinned one is narrower, so it wins. `IJoin<AuditEvent,User>` matches
    // only the general template, which still serves it.
    const pinnedJoin = app.resolve<IJoin<Order, User>>();
    const generalJoin = app.resolve<IJoin<AuditEvent, User>>();

    // A minted closing is a registration like any other, so the lifetime tag on
    // the template applies PER CLOSING: `IRepository<User>` is a singleton, and
    // `IRepository<Order>` is a different singleton.
    const usersAgain = app.resolve<IRepository<User>>();

    // The registration probe understands the template too: it answers for
    // anything the container COULD mint, not just what was registered
    // literally.
    const orderRepositoryIsKnown = app.isService<IRepository<Order>>();

    let templateOutcome = 'unexpectedly resolved';
    try {
      app.resolve(REPOSITORY_TEMPLATE);
    } catch (error) {
      if (error instanceof OpenTokenResolutionError) {
        templateOutcome = 'threw OpenTokenResolutionError';
      }
    }

    return ['=== di open generics — with transformer ===',
      'IRepository<$1> is registered ONCE; every closing below is minted from it:',
      `  IRepository<User>: ${users.describe()}`, `  IRepository<Order>: ${orders.describe()}`,
      'the closing propagates down the graph — IRepository<T> -> ITable<T> -> Seed<T>:',
      `  ITable<User> reports the closing it was minted for: ${userTable.entityToken}`,
      `  IRepository<User>.all() is the array registered as Seed<User>: ${Object.is(users.all(), USER_SEED.rows)}`,
      'an EXACT closed registration outranks the template:', `  IRepository<AuditEvent>: ${audit.describe()}`,
      'arity 2 — $1 and $2 close independently, each side keeping its own precedence:',
      `  IJoin<User,AuditEvent>: ${join.describe()}`,
      'a template may pin some arguments; where two overlap, the MOST SPECIFIC wins:',
      `  IJoin<Order,User> goes to the pinned IJoin<Order,$2>: ${pinnedJoin.describe()}`,
      `  IJoin<AuditEvent,User> goes to the general IJoin<$1,$2>: ${generalJoin.describe()}`,
      'every closing is its own singleton:',
      `  IRepository<User> resolved twice is one instance: ${Object.is(users, usersAgain)}`,
      `  IRepository<User> and IRepository<Order> are separate instances: ${!Object.is(users, orders)}`,
      'a closing nobody registered still answers the registration probe:',
      `  isService(IRepository<Order>): ${orderRepositoryIsKnown}`,
      'the template itself is NOT resolvable — a hole is not a service:',
      `  resolving ${REPOSITORY_TEMPLATE} ${templateOutcome}`];
  } finally {
    // The scope owns every singleton it cached, including the ones minted from
    // the templates; disposing it releases each closing.
    app.dispose();
  }
}

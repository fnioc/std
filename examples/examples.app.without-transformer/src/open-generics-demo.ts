// OPEN GENERICS, manual dialect — one registration, unbounded closings.
//
// The SAME scenario as ../../examples.app.with-transformer/src/
// open-generics-demo.ts, hand-wired with plain `tsc`: every token is a string
// this file spells out, and every dependency signature is plain data. The two
// files print byte-identical lines, which is the point — the tokenless dialect
// lowers to exactly this and adds nothing.
//
// The problem being solved: a persistence layer with N entity types should not
// need N repository registrations. Register the repository ONCE against a token
// that still has a HOLE in it — `…:IRepository<$1>` — and the container mints a
// closed registration on demand for whichever closing is asked for. Adding a
// fourth entity later costs one `Seed<T>` value and nothing else.
//
// THE HOLE IS JUST TEXT HERE. Where the tokenless dialect writes the
// compile-time brands `$<1>` / `Hole<1, Entity>`, this file writes the
// literal `"$1"` inside a token string. The brands exist so a transformer can
// DERIVE that text; with no transformer there is nothing to derive and the
// substring is the whole mechanism. Likewise the `Typeof<TEntity>` parameter
// brand has a plain-data counterpart: the `typeArg(1)` slot, which asks the
// engine to pass the token string of the registration's first type argument.
// `typeArg` is positional (name the hole by number) where `Typeof<T>` is
// type-driven (infer the hole from `T`) — same slot either way.
//
// Tokens are composed with `closeToken`, the public grammar helper, rather than
// by string concatenation: `closeToken(base, arg)` renders `base<arg>` and
// `closeToken(base, "$1", "$2")` renders the arity-2 template. Hand-writing the
// grammar by hand is exactly where a manual author drifts from what the
// transformer derives, and the helper removes the opportunity.
//
// WHAT AN OPEN TEMPLATE MAY LOOK LIKE. The engine this branch builds against
// requires every top-level type argument of the SERVICE token to be a hole:
// `IRepository<$1>` and `IJoin<$1,$2>` are templates, and a partially-open
// `IJoin<…:User,$2>` is rejected at registration with `OpenTokenRegistrationError`
// — see `demonstrateErrors` in @rhombus-std/examples.lib.without-transformer,
// which raises exactly that. Holes inside a DEPENDENCY slot carry no such
// restriction, which is what makes the propagation below work.

import { closeToken, OpenTokenResolutionError, ServiceManifest, typeArg } from '@rhombus-std/di';

import type { AuditEvent, Entity, IJoin, IRepository, ITable, Order, Seed,
  User } from '@rhombus-std/examples.contracts';

// ── the tokens, spelled as the transformer derives them ─────────────────────
//
// `<import-specifier>:<exported-name>` for a package-public type, and
// `base<arg>` for a closing. Writing them by hand is what lets this app behave
// identically to the tokenless one — and, more usefully, what lets a manual
// consumer interoperate with a library that was authored tokenlessly.

const USER_TOKEN = '@rhombus-std/examples.contracts:User';
const ORDER_TOKEN = '@rhombus-std/examples.contracts:Order';
const AUDIT_EVENT_TOKEN = '@rhombus-std/examples.contracts:AuditEvent';

const SEED_BASE = '@rhombus-std/examples.contracts:Seed';
const TABLE_BASE = '@rhombus-std/examples.contracts:ITable';
const REPOSITORY_BASE = '@rhombus-std/examples.contracts:IRepository';
const JOIN_BASE = '@rhombus-std/examples.contracts:IJoin';

// The three open TEMPLATES. A hole is `$N`, 1-based, and it is matched
// positionally against the closing's arguments — `$1` in `IJoin<$1,$2>` binds
// the first argument wherever else `$1` appears in that registration.
const TABLE_TEMPLATE = closeToken(TABLE_BASE, '$1');
const REPOSITORY_TEMPLATE = closeToken(REPOSITORY_BASE, '$1');
const JOIN_TEMPLATE = closeToken(JOIN_BASE, '$1', '$2');

// ── the data each closing bottoms out at ────────────────────────────────────

// Registered CLOSED, one value per entity: `Seed<User>`, `Seed<Order>`,
// `Seed<AuditEvent>` are three ordinary registrations with no holes in them.
// They are the floor of the template's recursion.
const USER_SEED: Seed<User> = {
  rows: [
    { id: 'u-1', name: 'Ada' },
    { id: 'u-2', name: 'Grace' },
  ],
};
const ORDER_SEED: Seed<Order> = {
  rows: [
    { id: 'o-1', total: 19 },
    { id: 'o-2', total: 5 },
    { id: 'o-3', total: 42 },
  ],
};
const AUDIT_SEED: Seed<AuditEvent> = {
  rows: [
    { id: 'a-1', action: 'login' },
    { id: 'a-2', action: 'export' },
  ],
};

// ── the implementations ─────────────────────────────────────────────────────

/**
 * The middle link. Registered as the open template `…:ITable<$1>`, so it is only
 * ever reached as a closed dependency of a closed repository.
 *
 * Both of its parameters carry the hole, in the two different ways a parameter
 * can:
 *   - `seed` is an ordinary dependency whose TOKEN contains the hole
 *     (`…:Seed<$1>`), substituted per closing into `…:Seed<…:User>`;
 *   - `entityToken` is not a dependency at all — the `typeArg(1)` slot asks for
 *     the TOKEN STRING of the type argument. That is how a generic
 *     implementation learns which closing it is, which it otherwise cannot know:
 *     a type parameter is erased, so there is nothing to reflect on at runtime.
 *     Note it is typed plain `string` here; the `Typeof<TEntity>` brand the
 *     tokenless dialect uses exists only to tell a transformer to emit this slot.
 */
class InMemoryTable<TEntity> implements ITable<TEntity> {
  readonly #seed: Seed<TEntity>;
  public readonly entityToken: string;

  public constructor(seed: Seed<TEntity>, entityToken: string) {
    this.#seed = seed;
    this.entityToken = entityToken;
  }

  public rows(): readonly TEntity[] {
    return this.#seed.rows;
  }
}

/**
 * The template a consumer actually asks for. `TEntity extends Entity` is the
 * bound that the tokenless dialect has to spell `Hole<1, Entity>` to satisfy;
 * with no transformer in play there is no type-level skolem at all, so the
 * constraint is simply the class's own business.
 */
class InMemoryRepository<TEntity extends Entity> implements IRepository<TEntity> {
  readonly #table: ITable<TEntity>;
  public readonly entityToken: string;

  public constructor(table: ITable<TEntity>, entityToken: string) {
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
 * token `…:IRepository<…:AuditEvent>`. An exact registration outranks the
 * template, so this one wins for that single closing and the template still
 * serves every other entity — the reason you can adopt a template without giving
 * up per-type behaviour.
 *
 * It depends on `…:ITable<…:AuditEvent>`, which is itself minted from the
 * `ITable` template: an exact registration and an open one compose freely.
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
 * An ARITY-2 template. Holes are numbered, not positional wildcards: `$1` and
 * `$2` bind independently, and each side then resolves through the ordinary
 * precedence rules — so asking for `…:IJoin<…:User,…:AuditEvent>` gets a
 * template-minted left side and the exact `AuditRepository` on the right.
 */
class RepositoryJoin<TLeft, TRight> implements IJoin<TLeft, TRight> {
  public constructor(
    public readonly left: IRepository<TLeft>,
    public readonly right: IRepository<TRight>,
  ) {}

  public describe(): string {
    return `${this.left.entityToken} (${this.left.all().length}) `
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
// generic about them — an open token is rejected by `addValue` outright, since a
// template has to synthesize a per-closing CLASS registration and a pre-built
// value cannot express that.
manifest = manifest.addValue(closeToken(SEED_BASE, USER_TOKEN), USER_SEED);
manifest = manifest.addValue(closeToken(SEED_BASE, ORDER_TOKEN), ORDER_SEED);
manifest = manifest.addValue(closeToken(SEED_BASE, AUDIT_EVENT_TOKEN), AUDIT_SEED);

// Template 1 — `…:ITable<$1>`. Its signature is where the hole propagates: the
// first slot is a token CONTAINING `$1`, the second is the `typeArg(1)` witness.
// Both are rewritten per closing before the class is constructed.
manifest = manifest.addClass(
  TABLE_TEMPLATE,
  InMemoryTable,
  [[closeToken(SEED_BASE, '$1'), typeArg(1)]],
  'singleton',
);

// Template 2 — `…:IRepository<$1>`, the one a consumer asks for. Its dependency
// is itself a template closing, so resolving `IRepository<User>` closes
// `ITable<$1>` to `ITable<User>` on the way down.
manifest = manifest.addClass(
  REPOSITORY_TEMPLATE,
  InMemoryRepository,
  [[closeToken(TABLE_BASE, '$1'), typeArg(1)]],
  'singleton',
);

// The one exact override. Registered at a fully CLOSED token, so it takes
// precedence over template 2 for `AuditEvent` and only for `AuditEvent`.
manifest = manifest.addClass(
  closeToken(REPOSITORY_BASE, AUDIT_EVENT_TOKEN),
  AuditRepository,
  [[closeToken(TABLE_BASE, AUDIT_EVENT_TOKEN)]],
  'singleton',
);

// Template 3 — arity 2. Each dependency names a DIFFERENT hole, so the two
// sides close independently.
manifest = manifest.addClass(
  JOIN_TEMPLATE,
  RepositoryJoin,
  [[closeToken(REPOSITORY_BASE, '$1'), closeToken(REPOSITORY_BASE, '$2')]],
  'singleton',
);

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
    const users = app.resolve<IRepository<User>>(closeToken(REPOSITORY_BASE, USER_TOKEN));
    const orders = app.resolve<IRepository<Order>>(closeToken(REPOSITORY_BASE, ORDER_TOKEN));

    // The middle template, resolved directly. Its `entityToken` came from the
    // `typeArg(1)` slot, filled in by the engine with the argument this closing
    // was minted for.
    const userTable = app.resolve<ITable<User>>(closeToken(TABLE_BASE, USER_TOKEN));

    // The exact registration for the one entity that needed different
    // behaviour.
    const audit = app.resolve<IRepository<AuditEvent>>(closeToken(REPOSITORY_BASE, AUDIT_EVENT_TOKEN));

    // Arity 2: the left hole closes onto the template, the right onto the exact
    // registration.
    const join = app.resolve<IJoin<User, AuditEvent>>(closeToken(JOIN_BASE, USER_TOKEN, AUDIT_EVENT_TOKEN));

    // A minted closing is a registration like any other, so the lifetime tag on
    // the template applies PER CLOSING: `IRepository<User>` is a singleton, and
    // `IRepository<Order>` is a different singleton.
    const usersAgain = app.resolve<IRepository<User>>(closeToken(REPOSITORY_BASE, USER_TOKEN));

    // The registration probe understands the template too: it answers for
    // anything the container COULD mint, not just what was registered
    // literally.
    const orderRepositoryIsKnown = app.isService(closeToken(REPOSITORY_BASE, ORDER_TOKEN));

    let templateOutcome = 'unexpectedly resolved';
    try {
      app.resolve(REPOSITORY_TEMPLATE);
    } catch (error) {
      if (error instanceof OpenTokenResolutionError) {
        templateOutcome = 'threw OpenTokenResolutionError';
      }
    }

    return [
      '=== di open generics — without transformer ===',
      'IRepository<$1> is registered ONCE; every closing below is minted from it:',
      `  IRepository<User>: ${users.describe()}`,
      `  IRepository<Order>: ${orders.describe()}`,
      'the closing propagates down the graph — IRepository<T> -> ITable<T> -> Seed<T>:',
      `  ITable<User> reports the closing it was minted for: ${userTable.entityToken}`,
      `  IRepository<User>.all() is the array registered as Seed<User>: ${Object.is(users.all(), USER_SEED.rows)}`,
      'an EXACT closed registration outranks the template:',
      `  IRepository<AuditEvent>: ${audit.describe()}`,
      'arity 2 — $1 and $2 close independently, each side keeping its own precedence:',
      `  IJoin<User,AuditEvent>: ${join.describe()}`,
      'every closing is its own singleton:',
      `  IRepository<User> resolved twice is one instance: ${Object.is(users, usersAgain)}`,
      `  IRepository<User> and IRepository<Order> are separate instances: ${!Object.is(users, orders)}`,
      'a closing nobody registered still answers the registration probe:',
      `  isService(IRepository<Order>): ${orderRepositoryIsKnown}`,
      'the template itself is NOT resolvable — a hole is not a service:',
      `  resolving ${REPOSITORY_TEMPLATE} ${templateOutcome}`,
    ];
  } finally {
    // The scope owns every singleton it cached, including the ones minted from
    // the templates; disposing it releases each closing.
    app.dispose();
  }
}

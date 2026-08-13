// The contracts the OPEN-GENERICS demonstration turns on. PURE TYPES, like the
// rest of this package — the two example apps supply the implementations.
//
// Open generics answer a question every persistence layer eventually asks: you
// have N entity types and you do NOT want N copies of the same repository
// registration. So you register the repository ONCE against a template Type
// carrying a HOLE — `IRepository<$1>` — and the container mints a closed
// registration on demand for whichever closing you ask for
// (`IRepository<User>`, `IRepository<Order>`, …). One registration, unbounded
// closings.
//
// The types below are deliberately layered three deep so the closing has
// somewhere to PROPAGATE to:
//
//   IRepository<TEntity>   ← the open template a consumer asks for
//     depends on ITable<TEntity>   ← itself an open template; the hole rides in
//       depends on Seed<TEntity>  ← registered CLOSED, once per entity
//
// Resolving `IRepository<User>` therefore closes `ITable<$1>` to `ITable<User>`
// on the way down and lands on the concrete `Seed<User>` value. That chain is
// the whole point: a hole in a dependency slot is substituted with the SAME
// argument the service Type was closed with, so one template registration
// reaches per-entity data without ever naming an entity.
//
// These types are exported through this package's public barrel on purpose: the
// Type a transformer derives is `Type.imported(exportedName, importSpecifier)`, so
// `IRepository<User>` derives
// `@rhombus-std/examples.contracts:IRepository<@rhombus-std/examples.contracts:User>`
// — exactly the Type the without-transformer app composes by hand. The two apps
// print the same Types because they mean the same thing.

/**
 * The shared shape every stored entity has. It exists so an implementation can
 * be written against `TEntity extends Entity` — which is what makes the
 * CONSTRAINED hole `Hole<1, Entity>` necessary rather than decorative: a bare
 * `$1` is unconstrained and would not satisfy that bound.
 */
export interface Entity {
  readonly id: string;
}

/** A person. One of the three entities the single repository template serves. */
export interface User extends Entity {
  readonly name: string;
}

/** A purchase. */
export interface Order extends Entity {
  readonly total: number;
}

/**
 * An audit record. Deliberately the ODD ONE OUT: the demonstration registers a
 * dedicated `IRepository<AuditEvent>` implementation at the CLOSED Type, which
 * takes precedence over the template — the escape hatch for the one entity whose
 * behaviour differs.
 */
export interface AuditEvent extends Entity {
  readonly action: string;
}

/**
 * The seed rows for ONE entity type. Registered CLOSED — `Seed<User>`,
 * `Seed<Order>`, `Seed<AuditEvent>` are three ordinary value registrations
 * with no holes in sight. They are where the open template's recursion bottoms
 * out.
 */
export interface Seed<TEntity> {
  readonly rows: readonly TEntity[];
}

/**
 * A per-entity storage table. Registered as the open template `ITable<$1>`, so
 * it is only ever reached as a DEPENDENCY of a closed `IRepository<T>` — the
 * middle link where the hole is carried, not where a consumer asks for it.
 */
export interface ITable<TEntity> {
  /**
   * The rendered form of `TEntity`'s Type, delivered by the container itself:
   * the implementation declares a `Typeof<TEntity>` parameter (or, hand-composed,
   * a `typeArg(1)` slot) and the engine substitutes the Type argument the
   * request was closed with. It is how a generic implementation learns WHICH
   * closing it is.
   */
  readonly entityToken: string;
  rows(): readonly TEntity[];
}

/**
 * The classic open-generic service — `IRepository<$1>` registered once, resolved
 * as `IRepository<User>`, `IRepository<Order>`, … The reason to reach for a
 * template is exactly this: the registration count stops growing with the entity
 * count.
 */
export interface IRepository<TEntity> {
  readonly entityToken: string;
  all(): readonly TEntity[];
  /** A one-line, order-stable summary — what the example prints. */
  describe(): string;
}

/**
 * An ARITY-2 template, `IJoin<$1,$2>`. Holes are numbered, not positional
 * placeholders: `$1` and `$2` close independently, so each side of the join
 * resolves its own repository. It also shows the two precedence rules composing
 * — ask for `IJoin<User,AuditEvent>` and the left side comes from the template
 * while the right side comes from the closed `IRepository<AuditEvent>`
 * registration.
 */
export interface IJoin<TLeft, TRight> {
  readonly left: IRepository<TLeft>;
  readonly right: IRepository<TRight>;
  describe(): string;
}

import { closeToken, OpenTokenResolutionError, ServiceManifest, typeArg } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';

// The whole-scenario guard behind the open-generics examples in
// examples/examples.app.{with,without}-transformer/src/open-generics-demo.ts.
//
// open-generics.test.ts pins each mechanism on its own. What it does NOT cover
// is the shape the examples are built on, and the one a real per-entity
// persistence layer actually has: a CHAIN of templates, where a template's
// dependency is itself a template closing, bottoming out at a closed value.
// Resolving `IRepository<User>` has to close `ITable<$1>` on the way down and
// land on the exact `Seed<User>` registration — a break anywhere in that chain
// leaves the examples printing something different, so it is pinned here rather
// than only in the app output diff.
//
// Tokens are spelled exactly as the examples spell them (and as the transformer
// derives them), so this file and the examples fail together if the grammar
// moves.

const USER = 'pkg:User';
const ORDER = 'pkg:Order';
const AUDIT = 'pkg:AuditEvent';

const SEED = 'pkg:Seed';
const TABLE = 'pkg:ITable';
const REPOSITORY = 'pkg:IRepository';
const JOIN = 'pkg:IJoin';

/** The middle link: one dependency carrying the hole, one type-argument witness. */
class Table {
  public constructor(public readonly seed: { readonly rows: readonly string[]; },
    public readonly entityToken: string) {}
}

/** The template a consumer asks for; its dependency is another template's closing. */
class Repository {
  public constructor(public readonly table: Table, public readonly entityToken: string) {}
}

/** The exact override registered at one CLOSED token, outranking the template. */
class AuditRepository {
  public constructor(public readonly table: Table) {}
}

/** The arity-2 template: two deps, each closing on a different hole. */
class Join {
  public constructor(public readonly left: Repository, public readonly right: AuditRepository) {}
}

/** The example's container, verbatim in shape. */
function buildScenario() {
  let manifest = new ServiceManifest();
  manifest = manifest.addValue(closeToken(SEED, USER), { rows: ['u-1', 'u-2'] });
  manifest = manifest.addValue(closeToken(SEED, ORDER), { rows: ['o-1'] });
  manifest = manifest.addValue(closeToken(SEED, AUDIT), { rows: ['a-1', 'a-2'] });
  manifest = manifest.addClass(closeToken(TABLE, '$1'), Table, [[closeToken(SEED, '$1'), typeArg(1)]], 'singleton');
  manifest = manifest.addClass(closeToken(REPOSITORY, '$1'), Repository, [[closeToken(TABLE, '$1'), typeArg(1)]],
    'singleton');
  manifest = manifest.addClass(closeToken(REPOSITORY, AUDIT), AuditRepository, [[closeToken(TABLE, AUDIT)]],
    'singleton');
  manifest = manifest.addClass(closeToken(JOIN, '$1', '$2'), Join, [[closeToken(REPOSITORY, '$1'),
    closeToken(REPOSITORY, '$2')]], 'singleton');
  return manifest.build().createScope('singleton');
}

describe('the open-generics example scenario', () => {
  test('a closing propagates through a template DEPENDENCY down to a closed value', () => {
    const app = buildScenario();
    const users = app.resolve<Repository>(closeToken(REPOSITORY, USER));

    // Every link closed on the SAME argument: the repository's own type-arg
    // witness, its table's, and the seed the table ended up holding.
    expect(users.entityToken).toBe(USER);
    expect(users.table.entityToken).toBe(USER);
    expect(users.table.seed.rows).toEqual(['u-1', 'u-2']);
    app.dispose();
  });

  test('the intermediate template resolves to the same singleton the repository received', () => {
    const app = buildScenario();
    const users = app.resolve<Repository>(closeToken(REPOSITORY, USER));

    expect(app.resolve<Table>(closeToken(TABLE, USER))).toBe(users.table);
    // A different closing is a different singleton all the way down.
    expect(app.resolve<Table>(closeToken(TABLE, ORDER))).not.toBe(users.table);
    app.dispose();
  });

  test('an exact closed registration outranks the template for that closing only', () => {
    const app = buildScenario();

    expect(app.resolve(closeToken(REPOSITORY, AUDIT))).toBeInstanceOf(AuditRepository);
    expect(app.resolve(closeToken(REPOSITORY, USER))).toBeInstanceOf(Repository);
    app.dispose();
  });

  test('an arity-2 template closes each hole independently, each side keeping its precedence', () => {
    const app = buildScenario();
    const join = app.resolve<Join>(closeToken(JOIN, USER, AUDIT));

    // $1 landed on the template, $2 on the exact registration.
    expect(join.left).toBeInstanceOf(Repository);
    expect(join.left.entityToken).toBe(USER);
    expect(join.right).toBeInstanceOf(AuditRepository);
    expect(join.right.table.entityToken).toBe(AUDIT);
    app.dispose();
  });

  test('a closing nobody registered still probes true, and the template itself does not resolve', () => {
    const app = buildScenario();

    expect(app.isService(closeToken(REPOSITORY, ORDER))).toBe(true);
    expect(() => app.resolve(closeToken(REPOSITORY, '$1'))).toThrow(OpenTokenResolutionError);
    app.dispose();
  });
});

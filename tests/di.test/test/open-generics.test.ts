import { closeToken, type IResolver, type IServiceManifest, NoSatisfiableSignatureError, type OpenRegistration,
  OpenTokenRegistrationError, OpenTokenResolutionError, type Registration, RESOLVER_TOKEN, ServiceManifest,
  ServiceProviderClass, type Token, typeArg, union, UnregisteredTokenError } from '@rhombus-std/di';
import type { Func } from '@rhombus-toolkit/func';
import { describe, expect, test } from 'bun:test';
import { AsyncDisposableThing, defineDeps, DisposeLog, G, SyncDisposable, T } from './fixtures.js';

// Open generics: the runtime engine side. Everything is hand-fed (no
// transformer) — open templates registered as string tokens with holes, closed
// tokens resolved against them. The transformer's lowered output produces
// exactly these calls.

class SqlRepo {
  public constructor(public readonly dep: unknown) {}
}
class MemRepo {
  public constructor(public readonly dep: unknown) {}
}
class ZeroRepo {
  public readonly kind = 'zero';
}

describe('open-table matching', () => {
  test('a closed token resolves against an open template, dep substituted', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass(G.RepoTemplate, SqlRepo, [['$1']]);

    const sp = services.build();
    const repo = sp.resolve<SqlRepo>(G.RepoOfA);

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('A!');
  });

  test('arity dispatch: <$1> and <$1,$2> are distinct registrations', () => {
    let services = new ServiceManifest();
    services = services.addClass('app/IR<$1>', ZeroRepo, [[]]);
    services = services.addClass('app/IR<$1,$2>', MemRepo, [[{ value: 'pair' }]]);

    const sp = services.build();

    expect(sp.resolve('app/IR<pkg:IA>')).toBeInstanceOf(ZeroRepo);
    expect(sp.resolve('app/IR<pkg:IA,pkg:IB>')).toBeInstanceOf(MemRepo);
    expect(() => sp.resolve('app/IR<pkg:IA,pkg:IB,pkg:IC>')).toThrow(
      UnregisteredTokenError,
    );
  });

  test('a non-canonical (whitespace) template base resolves its canonical closing', () => {
    let services = new ServiceManifest();
    // Stray whitespace in the base: the engine keys the open table by the
    // canonical baseKey, so a canonically-spelled closing still finds it — a
    // raw-base key would strand it under a spelling the closing never derives.
    services = services.addClass('app/IR <$1>', ZeroRepo, [[]]);
    const sp = services.build();

    expect(sp.resolve('app/IR<pkg:IA>')).toBeInstanceOf(ZeroRepo);
  });

  // The base's whitespace (above) was always classified open — the string
  // grammar reads it as part of the base. Whitespace AROUND THE HOLE was not:
  // the raw arg slice `" $1 "` did not match the hole pattern, so the template
  // registered as an EXACT entry on a literal holey token, silently, and no
  // closing could ever reach it. Classification reads the typed tree now, so
  // every spelling of one template behaves like the template it parses to.
  test('whitespace around a hole does not strand the template', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IR< $1 >', SqlRepo, [['$1']]);

    const sp = services.build();
    const repo = sp.resolve<SqlRepo>(closeToken('app/IR', T.A));

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('A!');
  });

  test('a mixed concrete/hole template survives a space after the comma', () => {
    // The natural hand spelling of a §124 mixed template. Registering it used to
    // succeed and then resolve NOTHING — not under the closing, and not under
    // its own spelling either (the un-substituted `$1` dep is unsatisfiable).
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IR<pkg:IUser, $1>', SqlRepo, [['$1']]);

    const sp = services.build();
    const repo = sp.resolve<SqlRepo>(closeToken('app/IR', 'pkg:IUser', T.A));

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('A!');
  });

  // Hole labels are 1-based and leading-zero-free, so `$01` is not a hole and
  // `app/IR<$01>` is not a template — it is an ordinary closed token that
  // happens to contain a `$`. It files exact, and the closing it was meant to
  // serve resolves nothing. This is the same standing shape `$0` has always
  // had; §129 only brought the tree parser into line with it.
  test('a leading-zero hole label is not a hole, so the token is not a template', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IR<$01>', SqlRepo, [['$01']]);

    const sp = services.build();

    expect(() => sp.resolve(closeToken('app/IR', T.A))).toThrow(
      UnregisteredTokenError,
    );
  });

  test('resolving a non-canonical template spelling names the hole, not a miss', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, SqlRepo, [['$1']]);

    const sp = services.build();

    expect(() => sp.resolve('pkg:IRepo< $1 >')).toThrow(OpenTokenResolutionError);
  });

  test('repeated holes match only equal args', () => {
    let services = new ServiceManifest();
    services = services.addClass('app/IPair<$1,$1>', ZeroRepo, [[]]);

    const sp = services.build();

    expect(sp.resolve('app/IPair<pkg:IA,pkg:IA>')).toBeInstanceOf(ZeroRepo);
    expect(() => sp.resolve('app/IPair<pkg:IA,pkg:IB>')).toThrow(
      UnregisteredTokenError,
    );
  });

  test('repeated-hole template wins for equal args; general template still matches unequal', () => {
    let services = new ServiceManifest();
    services = services.addClass('app/IPair<$1,$2>', MemRepo, [[{ value: 'any' }]]);
    services = services.addClass('app/IPair<$1,$1>', ZeroRepo, [[]]);

    const sp = services.build();

    expect(sp.resolve('app/IPair<pkg:IA,pkg:IA>')).toBeInstanceOf(ZeroRepo);
    expect(sp.resolve('app/IPair<pkg:IA,pkg:IB>')).toBeInstanceOf(MemRepo);
  });

  test('...and it wins registered FIRST too — selection is specificity, not recency', () => {
    let services = new ServiceManifest();
    services = services.addClass('app/IPair<$1,$1>', ZeroRepo, [[]]);
    services = services.addClass('app/IPair<$1,$2>', MemRepo, [[{ value: 'any' }]]);

    const sp = services.build();

    // `<$1,$1>` scores 2 (one concrete node + one repeated label) against
    // `<$1,$2>`'s 1, so it is tried first however the two were ordered.
    expect(sp.resolve('app/IPair<pkg:IA,pkg:IA>')).toBeInstanceOf(ZeroRepo);
    expect(sp.resolve('app/IPair<pkg:IA,pkg:IB>')).toBeInstanceOf(MemRepo);
  });

  test('last-wins among identical templates', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass(G.RepoTemplate, SqlRepo, [['$1']]);
    services = services.addClass(G.RepoTemplate, MemRepo, [['$1']]);

    const sp = services.build();

    expect(sp.resolve(G.RepoOfA)).toBeInstanceOf(MemRepo);
  });

  test('an exact closed registration beats the open fallback', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addValue(T.B, 'B!');
    services = services.addClass(G.RepoTemplate, SqlRepo, [['$1']]);
    services = services.addClass(G.RepoOfA, MemRepo, [[T.A]]);

    const sp = services.build();

    expect(sp.resolve(G.RepoOfA)).toBeInstanceOf(MemRepo);
    expect(sp.resolve(G.RepoOfB)).toBeInstanceOf(SqlRepo);
  });

  test('a nested closed-generic arg closes recursively through the graph', () => {
    class Box {
      public constructor(public readonly inner: unknown) {}
    }
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IBox<$1>', Box, [['$1']]);
    services = services.addClass(G.RepoTemplate, SqlRepo, [['$1']]);

    const sp = services.build();
    const repo = sp.resolve<SqlRepo>('pkg:IRepo<app/IBox<pkg:IA>>');

    expect(repo.dep).toBeInstanceOf(Box);
    expect((repo.dep as Box).inner).toBe('A!');
  });

  test('non-generic misses are untouched by the fallback', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]]);

    const sp = services.build();

    expect(() => sp.resolve(T.Logger)).toThrow(UnregisteredTokenError);
  });
});

// A template may mix concrete args and holes at any depth. The v1 all-holes
// registration rule is retired: a concrete arg constrains the match (it must
// equal the closing's arg exactly), a hole binds whatever the closing carries.
describe('partially-closed templates', () => {
  test('a concrete arg pins its position; the hole still binds and substitutes', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.B, 'B!');
    services = services.addClass('app/IR<pkg:IA,$1>', SqlRepo, [['$1']]);

    const sp = services.build();
    const repo = sp.resolve<SqlRepo>('app/IR<pkg:IA,pkg:IB>');

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('B!');
    // The concrete first arg has to match exactly — a different one misses.
    expect(() => sp.resolve('app/IR<pkg:IZ,pkg:IB>')).toThrow(UnregisteredTokenError);
  });

  test('a hole nested inside a concrete arg closes', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IR<app/IBox<$1>>', SqlRepo, [['$1']]);

    const sp = services.build();
    const repo = sp.resolve<SqlRepo>('app/IR<app/IBox<pkg:IA>>');

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('A!');
    // The nesting is structural: an unwrapped arg is a different shape.
    expect(() => sp.resolve('app/IR<pkg:IA>')).toThrow(UnregisteredTokenError);
  });

  test('holes bind by LABEL around a pinned middle arg', () => {
    class Inverted {
      public constructor(
        public readonly first: unknown,
        public readonly second: unknown,
      ) {}
    }
    let services = new ServiceManifest();
    services = services.addClass('app/IInv<$7,pkg:IB,$3>', Inverted, [[typeArg(3), typeArg(7)]]);

    const sp = services.build();
    const inv = sp.resolve<Inverted>('app/IInv<pkg:IX,pkg:IB,pkg:IY>');

    expect(inv.first).toBe('pkg:IY');
    expect(inv.second).toBe('pkg:IX');
    expect(() => sp.resolve('app/IInv<pkg:IX,pkg:IC,pkg:IY>')).toThrow(
      UnregisteredTokenError,
    );
  });

  test('every slot kind closes through a template that also carries a concrete arg', () => {
    class KitchenSink {
      public constructor(
        public readonly sp: IResolver,
        public readonly lit: unknown,
        public readonly argToken: unknown,
        public readonly dep: unknown,
        public readonly viaUnion: unknown,
      ) {}
    }
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IKitchen<pkg:IC,$1>', KitchenSink, [[
      RESOLVER_TOKEN,
      { value: 42 },
      typeArg(1),
      '$1',
      union('app/absent', '$1'),
    ]]);

    const sp = services.build();
    const sink = sp.resolve<KitchenSink>('app/IKitchen<pkg:IC,pkg:IA>');

    expect(typeof sink.sp.resolve).toBe('function');
    expect(sink.lit).toBe(42);
    expect(sink.argToken).toBe(T.A);
    expect(sink.dep).toBe('A!');
    expect(sink.viaUnion).toBe('A!');
  });

  test('a partially-closed template and a general one share a base and split the closings', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.B, 'B!');
    services = services.addClass('app/IR<$1,$2>', MemRepo, [[{ value: 'general' }]]);
    services = services.addClass('app/IR<pkg:IA,$1>', SqlRepo, [['$1']]);

    const sp = services.build();

    // The specific template serves the closings it covers; the general one
    // serves the rest.
    expect(sp.resolve('app/IR<pkg:IA,pkg:IB>')).toBeInstanceOf(SqlRepo);
    expect(sp.resolve('app/IR<pkg:IZ,pkg:IB>')).toBeInstanceOf(MemRepo);
  });

  test('...and the split holds with the SPECIFIC template registered FIRST', () => {
    // The inverse registration order of the test above. Selection is
    // most-specific-first, not recency, so the order does not matter.
    let services = new ServiceManifest();
    services = services.addValue(T.B, 'B!');
    services = services.addClass('app/IR<pkg:IA,$1>', SqlRepo, [['$1']]);
    services = services.addClass('app/IR<$1,$2>', MemRepo, [[{ value: 'general' }]]);

    const sp = services.build();

    expect(sp.resolve('app/IR<pkg:IA,pkg:IB>')).toBeInstanceOf(SqlRepo);
    expect(sp.resolve('app/IR<pkg:IZ,pkg:IB>')).toBeInstanceOf(MemRepo);
  });

  test('the open-table key of a mixed template is the base its closings derive', () => {
    // Both templates bucket under `app/IR`, the same key `#lookup` derives from
    // every closing of them — the invariant the open table is gated on.
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IR<pkg:IA,$1>', ZeroRepo, [[]]);
    services = services.addClass('app/IR<app/IBox<$1>>', SqlRepo, [['$1']]);

    const sp = services.build();

    expect(sp.resolve('app/IR<pkg:IA,pkg:IB>')).toBeInstanceOf(ZeroRepo);
    expect(sp.resolve('app/IR<app/IBox<pkg:IA>>')).toBeInstanceOf(SqlRepo);
  });

  test('dedup is by template STRING — a mixed template does not dedup against a general one', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addClass('app/IR<pkg:IA,$1>', ZeroRepo, [[]]);

    // Same template string: the tryAdd is a no-op, so the first ctor survives.
    expect(base.tryAdd('app/IR<pkg:IA,$1>', MemRepo, [[]]).build().resolve(
      'app/IR<pkg:IA,pkg:IB>',
    )).toBeInstanceOf(ZeroRepo);

    // A DIFFERENT template on the same base is a different service token, so it
    // registers rather than dedup'ing away.
    expect(base.tryAdd('app/IR<$1,$2>', MemRepo, [[]]).build().resolve(
      'app/IR<pkg:IZ,pkg:IB>',
    )).toBeInstanceOf(MemRepo);

    // removeAll is keyed by the canonical BASE the entry is bucketed under.
    const cleared = base.removeAll('app/IR').build();
    expect(() => cleared.resolve('app/IR<pkg:IA,pkg:IB>')).toThrow(UnregisteredTokenError);

    // A bare BASE never dedups a template away — they are different services.
    expect(base.tryAdd('app/IR', MemRepo, [[]]).build().resolve('app/IR')).toBeInstanceOf(
      MemRepo,
    );
  });

  test('removeAll also drops an open entry named by its TEMPLATE', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addClass('app/IR<$1>', ZeroRepo, [[]]);
    base = base.addClass('app/IR<pkg:IA,$1>', MemRepo, [[]]);

    // The template names exactly one entry; its sibling on the same base stays.
    const cleared = base.removeAll('app/IR<$1>').build();
    expect(() => cleared.resolve('app/IR<pkg:IB>')).toThrow(UnregisteredTokenError);
    expect(cleared.resolve('app/IR<pkg:IA,pkg:IB>')).toBeInstanceOf(MemRepo);
  });

  test('replace on a template SWAPS it rather than accumulating a duplicate', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addClass('app/IR<$1>', ZeroRepo, [[]]);
    base = base.replace('app/IR<$1>', MemRepo, [[]]);

    // One entry left, and it is the replacement — not a second template the
    // most-specific-first scan happens to reach first.
    expect([...base].filter((e) => e.kind === 'open')).toHaveLength(1);
    expect(base.build().resolve('app/IR<pkg:IB>')).toBeInstanceOf(MemRepo);
  });
});

describe('substitution across slot kinds', () => {
  test('provider token, LiteralRef, TypeArgRef, hole token, and Union-with-hole all close', () => {
    class KitchenSink {
      public constructor(
        public readonly sp: IResolver,
        public readonly lit: unknown,
        public readonly argToken: unknown,
        public readonly dep: unknown,
        public readonly viaUnion: unknown,
      ) {}
    }
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IKitchen<$1>', KitchenSink, [[
      RESOLVER_TOKEN,
      { value: 42 },
      typeArg(1),
      '$1',
      union('app/absent', '$1'),
    ]]);

    const sp = services.build();
    const sink = sp.resolve<KitchenSink>('app/IKitchen<pkg:IA>');

    expect(typeof sink.sp.resolve).toBe('function');
    expect(sink.lit).toBe(42);
    // The TypeArgRef closed into a LiteralRef carrying the arg's TOKEN string.
    expect(sink.argToken).toBe(T.A);
    expect(sink.dep).toBe('A!');
    expect(sink.viaUnion).toBe('A!');
  });

  test('FactoryRef.type and FactoryRef.params holes are substituted', () => {
    class Thing {
      public constructor(public readonly supplied: unknown) {}
    }
    class Consumer {
      public constructor(
        public readonly makeThing: Func<[p: unknown], Thing>,
      ) {}
    }
    let services = new ServiceManifest();
    services = services.addClass('app/IThing<$1>', Thing, [['app/IParam<$1>']]);
    services = services.addClass('app/IConsumer<$1>', Consumer, [[
      { type: 'app/IThing<$1>', params: ['app/IParam<$1>'] },
    ]]);

    const sp = services.build();
    const consumer = sp.resolve<Consumer>('app/IConsumer<pkg:IA>');
    const thing = consumer.makeThing('hello');

    expect(thing).toBeInstanceOf(Thing);
    expect(thing.supplied).toBe('hello');
  });

  test('holes bind by NUMBER, not position: <$2,$1> inverts', () => {
    class Inverted {
      public constructor(
        public readonly first: unknown,
        public readonly second: unknown,
      ) {}
    }
    let services = new ServiceManifest();
    services = services.addClass('app/IInv<$2,$1>', Inverted, [[typeArg(1), typeArg(2)]]);

    const sp = services.build();
    // Template <$2,$1> closed as <pkg:IA,pkg:IB>: $2 = pkg:IA, $1 = pkg:IB.
    const inv = sp.resolve<Inverted>('app/IInv<pkg:IA,pkg:IB>');

    expect(inv.first).toBe(T.B);
    expect(inv.second).toBe(T.A);
  });
});

describe('memoization', () => {
  /** A memo Map that counts `set` calls so re-synthesis is observable. The memo
   * holds the FULL ranked closing list per closed token, not a single entry. */
  class CountingMap extends Map<Token, readonly Registration[]> {
    public sets = 0;
    public override set(key: Token, value: readonly Registration[]): this {
      this.sets += 1;
      return super.set(key, value);
    }
  }

  const openTable = (
    reg: OpenRegistration,
  ): ReadonlyMap<Token, readonly OpenRegistration[]> => new Map([[reg.base, [reg]]]);

  test('repeat resolves reuse the identical synthesized Registration object', () => {
    const memo = new CountingMap();
    const sp = new ServiceProviderClass(
      new Map(),
      openTable({
        template: G.RepoTemplate,
        base: T.Repo,
        ctor: ZeroRepo,
        scope: undefined,
      }),
      memo,
    );

    sp.resolve(G.RepoOfA);
    const first = memo.get(G.RepoOfA);
    expect(first).toBeDefined();

    sp.resolve(G.RepoOfA);
    expect(memo.get(G.RepoOfA)).toBe(first!);
    expect(memo.sets).toBe(1);
    expect(memo.size).toBe(1);
  });

  test('the memo is shared across scope frames of one provider tree', () => {
    const memo = new CountingMap();
    const sp = new ServiceProviderClass(
      new Map(),
      openTable({
        template: G.RepoTemplate,
        base: T.Repo,
        ctor: ZeroRepo,
        scope: undefined,
      }),
      memo,
    );

    sp.createScope('one').resolve(G.RepoOfA);
    sp.createScope('two').resolve(G.RepoOfA);

    expect(memo.sets).toBe(1);
  });
});

describe('per-closing scoping', () => {
  test('distinct closings cache distinct singletons; same closing is cached', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]], 'singleton');

    const app = services.build().createScope('singleton');
    const a1 = app.resolve(G.RepoOfA);
    const a2 = app.resolve(G.RepoOfA);
    const b = app.resolve(G.RepoOfB);

    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(b).toBeInstanceOf(ZeroRepo);
  });

  test('an open registration without .as() is transient per closing', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]]);

    const app = services.build().createScope('singleton');

    expect(app.resolve(G.RepoOfA)).not.toBe(app.resolve(G.RepoOfA));
  });

  test('.as() appends a scoped COPY — a later transient re-registration wins', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]], 'singleton');
    services = services.addClass(G.RepoTemplate, MemRepo, [[{ value: 'm' }]]);

    const app = services.build().createScope('singleton');
    const r1 = app.resolve(G.RepoOfA);
    const r2 = app.resolve(G.RepoOfA);

    expect(r1).toBeInstanceOf(MemRepo);
    expect(r1).not.toBe(r2);
  });

  test('closed registrations follow the owner-relative captive-dependency rule', () => {
    class Dep {}
    class Repo {
      public constructor(public readonly dep: Dep) {}
    }
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addClass('app/Dep', Dep, [[]], 'request');
    services = services.addClass(G.RepoTemplate, Repo, [['app/Dep']], 'singleton');

    const app = services.build().createScope('singleton');
    const req = app.createScope('request');

    const cachedDep = req.resolve<Dep>('app/Dep');
    const repo = req.resolve<Repo>(G.RepoOfA);

    // The singleton-owned repo constructs relative to the singleton frame,
    // where no "request" frame encloses — its dep is a fresh transient, NOT
    // the request-cached instance (no captured shorter-lived dep).
    expect(repo.dep).toBeInstanceOf(Dep);
    expect(repo.dep).not.toBe(cachedDep);
    expect(req.resolve<Dep>('app/Dep')).toBe(cachedDep);
  });
});

describe('registration-carried signatures', () => {
  test("a closed registration's carried signatures beat the ctor-keyed store", () => {
    class Impl {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(Impl, [[T.A]]);

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addValue(T.B, 'B!');
    services = services.addClass('app/S1', Impl, [[T.B]]);
    // No carried signature — pass the same signature `defineDeps` stashed above,
    // now required explicitly rather than read from the ctor-keyed store.
    services = services.addClass('app/S2', Impl, [[T.A]]);

    const sp = services.build();

    expect(sp.resolve<Impl>('app/S1').dep).toBe('B!'); // carried wins
    expect(sp.resolve<Impl>('app/S2').dep).toBe('A!'); // its own explicit signature
  });

  test("an open registration's carried template beats the ctor-keyed store", () => {
    class GenImpl {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(GenImpl, [[T.A]]);

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addValue(T.B, 'B!');
    services = services.addClass('app/IG<$1>', GenImpl, [['$1']]);

    const sp = services.build();

    expect(sp.resolve<GenImpl>('app/IG<pkg:IB>').dep).toBe('B!');
  });

  test('an open registration carries its hole template inline (typeArg substitution)', () => {
    class ManualImpl {
      public constructor(
        public readonly dep: unknown,
        public readonly argToken: unknown,
      ) {}
    }

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    // Signatures ride on the registration (the global store is retired): the
    // open template's `$1` / typeArg(1) slots substitute per closing.
    services = services.addClass('app/IM<$1>', ManualImpl, [['$1', typeArg(1)]]);

    const sp = services.build();
    const m = sp.resolve<ManualImpl>('app/IM<pkg:IA>');

    expect(m.dep).toBe('A!');
    expect(m.argToken).toBe(T.A);
  });
});

describe('errors', () => {
  test('resolving a token that still contains holes throws OpenTokenResolutionError', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]]);

    const sp = services.build();

    expect(() => sp.resolve(G.RepoTemplate)).toThrow(OpenTokenResolutionError);
    expect(() => sp.resolve('app/Never<$3>')).toThrow(OpenTokenResolutionError);
  });

  test('a KEYED holey token gets the same diagnosis, not a plain miss', () => {
    let services = new ServiceManifest();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]]);

    const sp = services.build();

    // `resolve(t, key)` composes `t#key`, past which the string grammar cannot
    // see the hole. The unbound hole is still the actionable half of the answer.
    expect(() => sp.resolve(G.RepoTemplate, 'k')).toThrow(OpenTokenResolutionError);
  });

  test('addValue with an open token throws OpenTokenRegistrationError', () => {
    const services = new ServiceManifest();

    expect(() => services.addValue(G.RepoTemplate, 'x')).toThrow(
      OpenTokenRegistrationError,
    );
  });

  test('addFactory with an open token throws OpenTokenRegistrationError', () => {
    const services = new ServiceManifest();

    expect(() => services.addFactory(G.RepoTemplate, () => 'x', [[]])).toThrow(
      OpenTokenRegistrationError,
    );
  });

  test('a bare hole as the service token throws — it names no base to register under', () => {
    const services = new ServiceManifest();

    expect(() => services.addClass('$1', ZeroRepo, [[]])).toThrow(
      OpenTokenRegistrationError,
    );
  });

  test('a template the token grammar refuses throws instead of registering a never-matches', () => {
    const services = new ServiceManifest();

    // `a b<$1>` is open by the string grammar (base `a b`, arg `$1`) but the
    // typed parser stops the base at the space and rejects the trailing text.
    // The engine unifies on the typed tree, so registering this would bucket an
    // entry `#lookup` could never match.
    expect(() => services.addClass('a b<$1>', ZeroRepo, [[]])).toThrow(
      OpenTokenRegistrationError,
    );
  });
});

describe('holey slots in normal resolution', () => {
  test('a holey token inside a Union slot is skipped, not thrown', () => {
    class WithUnion {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(WithUnion, [[union('app/IX<$1>', T.A)]]);

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass(T.Service, WithUnion, [[union('app/IX<$1>', T.A)]]);

    const sp = services.build();

    expect(sp.resolve<WithUnion>(T.Service).dep).toBe('A!');
  });

  test('a signature containing a holey token is unsatisfiable — greedy selection falls back', () => {
    class Overloaded {
      public constructor(...args: unknown[]) {
        this.args = args;
      }
      public readonly args: unknown[];
    }
    defineDeps(Overloaded, [
      ['app/IX<$1>', T.A],
      [T.A],
    ]);

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass(T.Service, Overloaded, [
      ['app/IX<$1>', T.A],
      [T.A],
    ]);

    const sp = services.build();

    expect(sp.resolve<Overloaded>(T.Service).args).toEqual(['A!']);
  });

  test('a raw TypeArgRef in the only signature is unsatisfiable', () => {
    class RawArg {
      public constructor(public readonly arg: unknown) {}
    }
    defineDeps(RawArg, [[typeArg(1)]]);

    let services = new ServiceManifest();
    services = services.addClass(T.Service, RawArg, [[typeArg(1)]]);

    const sp = services.build();

    expect(() => sp.resolve(T.Service)).toThrow(NoSatisfiableSignatureError);
  });
});

describe('gappy open template whose signature references an unbound hole', () => {
  // A mis-authored open template: the service token binds holes $1 and $3, but
  // a carried signature references $2 — which no closing ever binds. The
  // transform does not police this (it is not transform's job to validate); it
  // surfaces at first resolve. Synthesis must NOT crash with a RangeError out of
  // #lookup — it must miss cleanly so resolution raises a DiError and greedy
  // selection can fall back.
  test('resolving such a closing raises a DiError, not an opaque RangeError', () => {
    let services = new ServiceManifest();
    services = services.addClass('app/IX<$1,$3>', ZeroRepo, [[typeArg(2)]]);

    const sp = services.build();

    expect(() => sp.resolve('app/IX<pkg:IA,pkg:IB>')).toThrow(
      UnregisteredTokenError,
    );
  });

  test('a mis-authored template does not delete a BETTER-RANKED sibling closing', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addValue(T.B, 'B!');
    // The specific template is well-formed and outranks the general one; the
    // general one is gappy. The gappy candidate is reached AFTER the winner has
    // already been synthesized, and must not take the winner down with it.
    services = services.addClass('app/IY<pkg:IA,$1>', SqlRepo, [['$1']]);
    services = services.addClass('app/IY<$1,$2>', MemRepo, [['$3']]);

    const repo = services.build().resolve<SqlRepo>('app/IY<pkg:IA,pkg:IB>');

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('B!');
  });

  test('a gappy template registered FIRST does not shadow the later well-formed one', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IZ<$1,$2>', MemRepo, [['$3']]);
    services = services.addClass('app/IZ<$1,$2>', SqlRepo, [['$1']]);

    const repo = services.build().resolve<SqlRepo>('app/IZ<pkg:IA,pkg:IA>');

    expect(repo).toBeInstanceOf(SqlRepo);
    expect(repo.dep).toBe('A!');
  });

  test('a collection keeps the closings the gappy sibling cannot contribute', () => {
    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IW<$1,$2>', MemRepo, [['$3']]);
    services = services.addClass('app/IW<$1,$2>', SqlRepo, [['$1']]);

    const all = services.build().resolve<object[]>('Array<app/IW<pkg:IA,pkg:IA>>');

    expect(all).toHaveLength(1);
    expect(all[0]).toBeInstanceOf(SqlRepo);
  });

  test('greedy selection falls back past a signature naming the unbound-hole dep', () => {
    class Host {
      public constructor(...args: unknown[]) {
        this.args = args;
      }
      public readonly args: unknown[];
    }
    // The longer signature depends on a closing of the gappy template; the
    // shorter (empty) signature is a valid fallback.
    defineDeps(Host, [['app/IX<pkg:IA,pkg:IB>'], []]);

    let services = new ServiceManifest();
    services = services.addClass('app/IX<$1,$3>', ZeroRepo, [[typeArg(2)]]);
    services = services.addClass(T.Service, Host, [['app/IX<pkg:IA,pkg:IB>'], []]);

    const sp = services.build();

    expect(sp.resolve<Host>(T.Service).args).toEqual([]);
  });
});

describe('disposal of open-synthesized instances (green guard)', () => {
  // The synthesized-from-open ClassRegistration is a distinct object per
  // closing living outside the sealed maps; it caches + registers for disposal
  // exactly like an exact registration. Pin that distinct closings dispose in
  // reverse construction order, both sync and async.
  test('distinct closings dispose in reverse construction order (sync)', () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(
      G.RepoTemplate,
      SyncDisposable,
      [[typeArg(1), { value: log }]],
      'singleton',
    );

    const app = services.build().createScope('singleton');
    app.resolve(G.RepoOfA); // label pkg:IA, constructed first
    app.resolve(G.RepoOfB); // label pkg:IB, constructed last

    app.dispose();

    expect(log.order).toEqual([T.B, T.A]);
  });

  test('distinct closings dispose in reverse construction order (async)', async () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(
      G.RepoTemplate,
      AsyncDisposableThing,
      [[typeArg(1), { value: log }]],
      'singleton',
    );

    const app = services.build().createScope('singleton');
    app.resolve(G.RepoOfA);
    app.resolve(G.RepoOfB);

    await app.disposeAsync();

    expect(log.order).toEqual([T.B, T.A]);
  });
});

describe('resolveFactory against an open template — top-level public API (green guard)', () => {
  // sp.resolveFactory(closedToken, params) funnels through the SAME open
  // fallback in #lookup as a FactoryRef ctor slot, but from a distinct call
  // site. Pin that the registration-carried substituted signature wins over the
  // ctor-keyed defineDeps store on this path too.
  test('zero-arg strict mode resolves a closing; carried template beats the ctor store', () => {
    class GenSvc {
      public constructor(public readonly dep: unknown) {}
    }
    defineDeps(GenSvc, [[T.A]]); // ctor-keyed store — must lose to the carried template

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addValue(T.B, 'B!');
    services = services.addClass('app/IG<$1>', GenSvc, [['$1']]);

    const sp = services.build();
    const make = sp.resolveFactory(closeToken('app/IG' as Token, T.B)) as Func<[], GenSvc>;
    const svc = make();

    expect(svc).toBeInstanceOf(GenSvc);
    expect(svc.dep).toBe('B!'); // "$1" → pkg:IB wins over the store's pkg:IA
  });

  test('parameterized mode partitions caller args against the substituted signature', () => {
    class Widget {
      public constructor(
        public readonly seed: unknown,
        public readonly supplied: unknown,
      ) {}
    }
    defineDeps(Widget, [['app/WRONG', 'app/WRONG2']]); // ctor store must not win

    let services = new ServiceManifest();
    services = services.addValue(T.A, 'A!');
    services = services.addClass('app/IW<$1>', Widget, [['$1', 'app/IParam']]);

    const sp = services.build();
    const make = sp.resolveFactory('app/IW<pkg:IA>', ['app/IParam']) as Func<[p: unknown], Widget>;
    const w = make('supplied!');

    expect(w).toBeInstanceOf(Widget);
    expect(w.seed).toBe('A!'); // "$1" → pkg:IA resolved from the container
    expect(w.supplied).toBe('supplied!'); // caller-supplied param
  });
});

describe('build() twice with open registrations (green guard)', () => {
  test('each build() yields an independent provider — no synthesized-closing leak', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(G.RepoTemplate, ZeroRepo, [[]], 'singleton');

    const p1 = services.build().createScope('singleton');
    const p2 = services.build().createScope('singleton');

    const a1 = p1.resolve(G.RepoOfA);
    const a2 = p2.resolve(G.RepoOfA);

    // Each build() allocates its OWN empty #closedMemo + sealed-open copy, so
    // the same closing synthesizes a DISTINCT Registration (and singleton)
    // per provider tree; neither leaks into the other.
    expect(a1).not.toBe(a2);
    expect(p1.resolve(G.RepoOfA)).toBe(a1);
    expect(p2.resolve(G.RepoOfA)).toBe(a2);
  });
});

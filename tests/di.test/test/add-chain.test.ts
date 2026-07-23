import { OpenTokenRegistrationError, ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest, ManifestEntry, Token } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';
import { G, T } from './fixtures.js';

// The `AddChain` registration continuation: STRUCTURAL SHARING (two branches off
// one manifest never see each other), ORDER-FREE once-each modifiers
// (`.as` / `.withKey` / `.withSignatures` in any order, each at most once — the
// APPEND face `.withSignature` is deliberately repeatable and sits outside that
// "each at most once" set), the equivalence of the positional and fluent
// spellings, and the registration-time ERROR TIMING that a REPLACE-not-append
// modifier has to preserve.
//
// A modifier REPLACES its own node over the same predecessor, so one
// `.addClass(...).as(...)` chain is exactly ONE registration — the entry-count
// assertions below are what catch a shadow entry, since last-wins resolution
// would look identical either way.

class Alpha {
  public readonly which = 'alpha';
}

class Beta {
  public readonly which = 'beta';
}

class Holder {
  public constructor(public readonly dep: string) {}
}

/** The entry stream's tokens, in registration order — `open` entries by base. */
function tokensOf(manifest: Iterable<ManifestEntry>): string[] {
  return [...manifest].map((entry) => (entry.kind === 'exact' ? entry.token : entry.base));
}

describe('structural sharing — branches off one manifest never contaminate', () => {
  test('two branches off a shared prefix stay independent', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.Config, 'shared');

    const x = base.addValue(T.Service, 'x');
    const y = base.addValue(T.Service, 'y');

    // Each branch sees the shared prefix plus ONLY its own leaf.
    expect(x.build().resolve<string>(T.Config)).toBe('shared');
    expect(y.build().resolve<string>(T.Config)).toBe('shared');
    expect(x.build().resolve<string>(T.Service)).toBe('x');
    expect(y.build().resolve<string>(T.Service)).toBe('y');
    // ...and the base sees neither leaf.
    expect(() => base.build().resolve(T.Service)).toThrow();
    expect(tokensOf(base)).toEqual([T.Config]);
  });

  test('branching does not leak into the COLLECTION view either', () => {
    // Last-wins resolution can mask a leak (`y` would still win on the `y`
    // branch); the aggregate is what exposes a stray sibling entry.
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.Service, 'shared');

    const x = base.addValue(T.Service, 'x');
    const y = base.addValue(T.Service, 'y');

    const all: Token = `Array<${T.Service}>`;
    expect(x.build().resolve<string[]>(all)).toEqual(['shared', 'x']);
    expect(y.build().resolve<string[]>(all)).toEqual(['shared', 'y']);
    expect(base.build().resolve<string[]>(all)).toEqual(['shared']);
  });

  test('a deep shared prefix with several divergence points', () => {
    let trunk: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    trunk = trunk.addValue(T.A, 'a');
    trunk = trunk.addValue(T.B, 'b');

    // Fork once...
    const left = trunk.addValue(T.C, 'left-c');
    const right = trunk.addValue(T.C, 'right-c');
    // ...then fork each fork again.
    const leftUp = left.addValue(T.Config, 'left-cfg');
    const leftDown = left.addValue(T.Config, 'left-cfg-alt');
    const rightUp = right.addValue(T.Config, 'right-cfg');

    expect(tokensOf(trunk)).toEqual([T.A, T.B]);
    expect(tokensOf(left)).toEqual([T.A, T.B, T.C]);
    expect(tokensOf(leftUp)).toEqual([T.A, T.B, T.C, T.Config]);

    expect(leftUp.build().resolve<string>(T.C)).toBe('left-c');
    expect(leftUp.build().resolve<string>(T.Config)).toBe('left-cfg');
    expect(leftDown.build().resolve<string>(T.Config)).toBe('left-cfg-alt');
    expect(rightUp.build().resolve<string>(T.C)).toBe('right-c');
    expect(rightUp.build().resolve<string>(T.Config)).toBe('right-cfg');
    // The trunk sees no leaf from any branch.
    expect(() => trunk.build().resolve(T.C)).toThrow();
    expect(() => trunk.build().resolve(T.Config)).toThrow();
  });

  test('branching AFTER .as() — the refined node is a shareable prefix', () => {
    const scoped = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]])
      .as('singleton');

    const withA = scoped.addValue(T.A, 'a');
    const withB = scoped.addValue(T.B, 'b');

    // Both branches inherit the SCOPED registration (cached in an open frame)...
    const rootA = withA.build().createScope('singleton');
    expect(rootA.resolve<Alpha>(T.Service)).toBe(rootA.resolve<Alpha>(T.Service));
    expect(withA.build().resolve<string>(T.A)).toBe('a');
    expect(withB.build().resolve<string>(T.B)).toBe('b');
    // ...and neither sees the other's leaf.
    expect(() => withA.build().resolve(T.B)).toThrow();
    expect(() => withB.build().resolve(T.A)).toThrow();
  });

  test('branching AFTER .withKey() — the key does not leak across branches', () => {
    const keyed = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]], 'singleton')
      .withKey('redis');

    const withA = keyed.addValue(T.A, 'a');
    const withB = keyed.addClass(T.Service, Beta, [[]], 'singleton');

    // The keyed registration is present on both, under `base#redis`.
    expect(withA.build().resolve<Alpha>(T.Service, 'redis')).toBeInstanceOf(Alpha);
    expect(withB.build().resolve<Alpha>(T.Service, 'redis')).toBeInstanceOf(Alpha);
    // The bare token only exists on the branch that registered it.
    expect(withB.build().resolve<Beta>(T.Service).which).toBe('beta');
    expect(() => withA.build().resolve(T.Service)).toThrow();
  });

  test('re-refining a chain node twice gives two SIBLINGS, not a stack', () => {
    // `.as()` REPLACES its node over the same predecessor, so refining the same
    // chain node twice yields two independent one-entry manifests.
    let base: IServiceManifest<'singleton' | 'request'> = new ServiceManifest<'singleton' | 'request'>();
    base = base.addValue(T.Config, 'shared');
    const pending = base.addClass(T.Service, Alpha, [[]]);

    const asSingleton = pending.as('singleton');
    const asRequest = pending.as('request');

    expect(tokensOf(asSingleton)).toEqual([T.Config, T.Service]);
    expect(tokensOf(asRequest)).toEqual([T.Config, T.Service]);

    // Each caches only in ITS OWN frame.
    const singletonRoot = asSingleton.build().createScope('singleton');
    expect(singletonRoot.resolve<Alpha>(T.Service)).toBe(singletonRoot.resolve<Alpha>(T.Service));
    const requestRoot = asRequest.build().createScope('singleton');
    expect(requestRoot.resolve<Alpha>(T.Service)).not.toBe(requestRoot.resolve<Alpha>(T.Service));
  });
});

describe('modifiers are order-free and apply at most once', () => {
  // One registration, three facets, six orderings. Every ordering must land the
  // SAME registration: token `pkg:IService#k`, lifetime `singleton`, and the
  // signature `[[T.B]]` (so the injected dep is `b-dep`). The chain starts from
  // the GATED 2-arg `addClass` form (no positional signature) so `withSignatures`
  // — the once-only BULK face — stays reachable; a positional signature would
  // strike it, leaving only the repeatable `withSignature` APPEND face.
  function seed(): IServiceManifest<'singleton'> {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a-dep');
    services = services.addValue(T.B, 'b-dep');
    return services;
  }

  /** Asserts the one-registration outcome every permutation must produce. */
  function expectKeyedSingletonWithSignature(manifest: IServiceManifest<'singleton'>): void {
    // Exactly THREE entries: the two seeded values plus ONE for the chain. A
    // modifier that appended instead of replacing would show up as a fourth.
    expect(tokensOf(manifest)).toEqual([T.A, T.B, `${T.Service}#k`]);

    const root = manifest.build().createScope('singleton');
    const holder = root.resolve<Holder>(T.Service, 'k');
    expect(holder).toBeInstanceOf(Holder);
    // `withSignatures` set the signature to `[[T.B]]`.
    expect(holder.dep).toBe('b-dep');
    // `.as('singleton')` took effect — cached in the open frame.
    expect(root.resolve<Holder>(T.Service, 'k')).toBe(holder);
    // `.withKey('k')` moved it off the bare token entirely.
    expect(root.tryResolve<Holder>(T.Service)).toBeUndefined();
  }

  test('as → withKey → withSignatures', () => {
    const chain = seed().addClass(T.Service, Holder);
    expectKeyedSingletonWithSignature(
      chain.as('singleton').withKey('k').withSignatures([T.B]),
    );
  });

  test('as → withSignatures → withKey', () => {
    const chain = seed().addClass(T.Service, Holder);
    expectKeyedSingletonWithSignature(
      chain.as('singleton').withSignatures([T.B]).withKey('k'),
    );
  });

  test('withKey → as → withSignatures', () => {
    const chain = seed().addClass(T.Service, Holder);
    expectKeyedSingletonWithSignature(
      chain.withKey('k').as('singleton').withSignatures([T.B]),
    );
  });

  test('withKey → withSignatures → as', () => {
    const chain = seed().addClass(T.Service, Holder);
    expectKeyedSingletonWithSignature(
      chain.withKey('k').withSignatures([T.B]).as('singleton'),
    );
  });

  test('withSignatures → as → withKey', () => {
    const chain = seed().addClass(T.Service, Holder);
    expectKeyedSingletonWithSignature(
      chain.withSignatures([T.B]).as('singleton').withKey('k'),
    );
  });

  test('withSignatures → withKey → as', () => {
    const chain = seed().addClass(T.Service, Holder);
    expectKeyedSingletonWithSignature(
      chain.withSignatures([T.B]).withKey('k').as('singleton'),
    );
  });
});

describe('positional and fluent spellings agree', () => {
  test('addClass(t, C, sig, scope, key) ≡ addClass(t, C, sig).as(scope).withKey(key)', () => {
    const positional = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]], 'singleton', 'k');
    const fluent = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]])
      .as('singleton')
      .withKey('k');
    const mixed = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]], 'singleton')
      .withKey('k');
    const reordered = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]])
      .withKey('k')
      .as('singleton');

    for (const manifest of [positional, fluent, mixed, reordered]) {
      expect(tokensOf(manifest)).toEqual([`${T.Service}#k`]);
      const root = manifest.build().createScope('singleton');
      const instance = root.resolve<Alpha>(T.Service, 'k');
      expect(instance).toBeInstanceOf(Alpha);
      expect(root.resolve<Alpha>(T.Service, 'k')).toBe(instance); // singleton-cached
      expect(root.tryResolve<Alpha>(T.Service)).toBeUndefined(); // not under the bare token
    }
  });

  test('addFactory positional and fluent spellings agree too', () => {
    const positional = new ServiceManifest<'singleton'>()
      .addFactory(T.Service, () => new Alpha(), [[]], 'singleton', 'k');
    const fluent = new ServiceManifest<'singleton'>()
      .addFactory(T.Service, () => new Alpha(), [[]])
      .withKey('k')
      .as('singleton');

    for (const manifest of [positional, fluent]) {
      expect(tokensOf(manifest)).toEqual([`${T.Service}#k`]);
      const root = manifest.build().createScope('singleton');
      expect(root.resolve<Alpha>(T.Service, 'k')).toBe(root.resolve<Alpha>(T.Service, 'k'));
    }
  });

  test('addValue(t, v, key) registers under base#key', () => {
    const manifest = new ServiceManifest<'singleton'>().addValue(T.Config, 'keyed', 'k');

    expect(tokensOf(manifest)).toEqual([`${T.Config}#k`]);
    const root = manifest.build();
    expect(root.resolve<string>(T.Config, 'k')).toBe('keyed');
    expect(root.tryResolve<string>(T.Config)).toBeUndefined();
  });

  test('withKey recomposes off the BASE token, never suffixing an already-keyed one', () => {
    // Re-keying is not reachable (the slot is consumed once), but the positional
    // key and the fluent key must land on the SAME single `#` suffix.
    const manifest = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]])
      .withKey('k')
      .as('singleton');

    expect(tokensOf(manifest)).toEqual([`${T.Service}#k`]);
    expect(tokensOf(manifest)[0]).not.toContain('##');
  });

  test('an EMPTY key is unkeyed — the token is left bare', () => {
    const manifest = new ServiceManifest<'singleton'>()
      .addClass(T.Service, Alpha, [[]], 'singleton')
      .withKey('');

    expect(tokensOf(manifest)).toEqual([T.Service]);
    expect(manifest.build().resolve<Alpha>(T.Service)).toBeInstanceOf(Alpha);
  });
});

describe('withSignature appends; withSignatures replaces in bulk', () => {
  test('withSignature APPENDS an overload — the first-declared (positional) signature still wins the arity tie', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a-dep');
    base = base.addValue(T.B, 'b-dep');

    const chain = base.addClass(T.Service, Holder, [[T.A]]);
    const appended = chain.withSignature(T.B);

    // `[T.A]` and `[T.B]` are now both satisfiable, equal-arity overloads; the
    // FIRST-declared one (the positional `[T.A]`) wins the tie (see
    // signature-selection.test.ts) — appending does not override it.
    expect(appended.build().resolve<Holder>(T.Service).dep).toBe('a-dep');
    // ...and one entry only — `withSignature` replaces the CHAIN NODE; only the
    // node's signature SET grows.
    expect(tokensOf(appended)).toEqual([T.A, T.B, T.Service]);
  });

  test('withSignatures REPLACES the whole signature set — reachable only before any signature is supplied', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a-dep');
    base = base.addValue(T.B, 'b-dep');

    const chain = base.addClass(T.Service, Holder); // gated: no positional signature yet
    const configured = chain.withSignatures([T.B]);

    expect(configured.build().resolve<Holder>(T.Service).dep).toBe('b-dep');
    expect(tokensOf(configured)).toEqual([T.A, T.B, T.Service]);
  });

  test('withSignatures also composes on a FACTORY chain', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a-dep');
    base = base.addValue(T.B, 'b-dep');

    const chain = base.addFactory(T.Service, (dep: string) => ({ dep })); // gated
    const configured = chain.withSignatures([T.B]);

    expect(configured.build().resolve<{ dep: string; }>(T.Service).dep).toBe('b-dep');
  });
});

describe('error timing — registration errors throw AT THE CALL, never at build()', () => {
  test('addFactory on an open token throws from the addFactory call', () => {
    const services = new ServiceManifest<'singleton'>();
    expect(() => services.addFactory(G.RepoTemplate, () => 'x', [[]])).toThrow(
      OpenTokenRegistrationError,
    );
  });

  test('addValue on an open token throws from the addValue call', () => {
    const services = new ServiceManifest<'singleton'>();
    expect(() => services.addValue(G.RepoTemplate, 'x')).toThrow(OpenTokenRegistrationError);
  });

  test('a mixed concrete/hole service token throws from the addClass call', () => {
    const services = new ServiceManifest<'singleton'>();
    expect(() => services.addClass('app/IR<pkg:IA,$1>', Alpha, [[]])).toThrow(
      OpenTokenRegistrationError,
    );
  });

  test('the throw happens EAGERLY — before any build(), and it leaves no node behind', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a');

    // The rejected call throws immediately; nothing partial escapes into `services`.
    expect(() => services.addValue(G.RepoTemplate, 'x')).toThrow(OpenTokenRegistrationError);
    expect(tokensOf(services)).toEqual([T.A]);
    // ...and a later build() is clean, i.e. the error was never deferred to seal.
    expect(() => services.build()).not.toThrow();
  });

  test('the plugin-less guard on addClass<I>(ctor) throws a TypeError from the call', () => {
    const services = new ServiceManifest<'singleton'>();
    const untyped = services as unknown as { addClass(c: unknown): unknown; };
    expect(() => untyped.addClass(Alpha)).toThrow(TypeError);
  });

  test('the plugin-less guard on addFactory<I>(fn) throws a TypeError from the call', () => {
    const services = new ServiceManifest<'singleton'>();
    const untyped = services as unknown as { addFactory(f: unknown): unknown; };
    expect(() => untyped.addFactory(() => 1)).toThrow(TypeError);
  });

  test('the plugin-less guard on addValue<I>(v) throws a TypeError from the call', () => {
    const services = new ServiceManifest<'singleton'>();
    const untyped = services as unknown as { addValue(v: unknown): unknown; };
    expect(() => untyped.addValue({ v: 1 })).toThrow(TypeError);
  });

  test('keying an OPEN template registration never yields a usable open registration', () => {
    // The base call classifies as OPEN; `withKey` recomposes `template#key`, which
    // re-runs classification. Whether that REJECTS the recomposition or demotes it
    // to an exact token, what must NOT happen is a live open template registered
    // under a keyed spelling: its closings must not resolve.
    const services = new ServiceManifest<'singleton'>();
    expect(() => {
      const keyed = services.addClass(G.RepoTemplate, Alpha, [[]], 'singleton').withKey('k');
      return keyed.build().resolve(G.RepoOfA);
    }).toThrow();
  });
});

describe('type-level slot gating (compile-time only)', () => {
  // These assert on the TYPES, not on runtime behaviour: the `@ts-expect-error`
  // lines fail the typecheck if the call ever becomes legal. Each body still runs,
  // so the suite also proves the surrounding chain is otherwise well-formed.
  test('a slot can be consumed at most once, and a consumed slot disappears', () => {
    const services = new ServiceManifest<'singleton'>();
    const chain = services.addClass(T.Service, Alpha, [[]]);

    // @ts-expect-error — the `scope` slot is consumed; `.as()` is gone.
    chain.as('singleton').as('singleton');
    // @ts-expect-error — the `key` slot is consumed; `.withKey()` is gone.
    chain.withKey('a').withKey('b');
    // @ts-expect-error — the positional signature struck the bulk `signatures`
    // slot; only the repeatable `withSignature` APPEND face survives it.
    chain.withSignatures([T.A]);

    // The legal spellings still type-check — `withSignature` (append) stays
    // reachable even after a positional signature.
    expect(tokensOf(chain.withSignature(T.A).as('singleton').withKey('k'))).toEqual([`${T.Service}#k`]);
  });

  test('a fully positional call leaves only the repeatable `withSignature` append face', () => {
    const services = new ServiceManifest<'singleton'>();
    const done = services.addClass(T.Service, Alpha, [[]], 'singleton', 'k');

    // @ts-expect-error — the `scope` slot was filled positionally.
    done.as('singleton');
    // @ts-expect-error — the `key` slot was filled positionally.
    done.withKey('other');

    // `signature` is the one slot a positional fill never consumes — it stays
    // repeatable so a hand author can append another overload.
    expect(tokensOf(done.withSignature())).toEqual([`${T.Service}#k`]);
    expect(tokensOf(done)).toEqual([`${T.Service}#k`]);
  });

  test('addValue returns a plain manifest — a value has no lifetime to tag', () => {
    const services = new ServiceManifest<'singleton'>();
    const done = services.addValue(T.Config, 'v');

    // @ts-expect-error — a value registration exposes no `as()`.
    done.as('singleton');
    // @ts-expect-error — a value's key is positional only.
    done.withKey('k');

    expect(tokensOf(done)).toEqual([T.Config]);
  });

  test('a scope-consumed chain still exposes withKey (and vice versa)', () => {
    const services = new ServiceManifest<'singleton'>();

    // Positional scope leaves the key face (plus the repeatable signature
    // append face, unexercised here)...
    const keyOnly = services.addClass(T.Service, Alpha, [[]], 'singleton');
    expect(tokensOf(keyOnly.withKey('k'))).toEqual([`${T.Service}#k`]);
    // @ts-expect-error — ...and the scope face is gone.
    keyOnly.as('singleton');
  });
});

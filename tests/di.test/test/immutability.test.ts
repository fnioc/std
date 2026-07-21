import { ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest, ManifestEntry } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// The manifest is an IMMUTABLE, ITERABLE DECORATOR CHAIN: every registration verb
// and every fluent modifier returns a NEW frozen node and leaves its receiver
// untouched. These tests pin the "receiver is unchanged" half of that — the
// branching/structural-sharing half lives in `add-chain.test.ts`, the entry-stream
// half in `manifest-iteration.test.ts`.
//
// Everything here asserts on OBSERVABLE behaviour (what a provider built from the
// pre-op manifest resolves) except the entry-count checks, which reach for the
// PUBLIC iterator — the only way to catch a shadow entry that resolution alone
// would hide.

class Alpha {
  public readonly which = 'alpha';
}

class Beta {
  public readonly which = 'beta';
}

/** The entry stream's tokens, in registration order — `open` entries by base. */
function tokensOf(manifest: Iterable<ManifestEntry>): string[] {
  return [...manifest].map((entry) => (entry.kind === 'exact' ? entry.token : entry.base));
}

/**
 * Attempts a raw property write. ESM is strict mode, so a frozen target throws;
 * swallowing lets the CALLER assert the thing that actually matters — that
 * nothing landed — under either semantics.
 */
function attemptWrite(target: object, key: string): void {
  try {
    (target as Record<string, unknown>)[key] = 'mutated';
  } catch {
    // Frozen target under strict mode. The absence assertion is the real check.
  }
}

describe('the receiver is unchanged after every registration verb', () => {
  test('add leaves the receiver empty', () => {
    const base = new ServiceManifest<'singleton'>();
    base.add(T.Service, Alpha, [[]], 'singleton'); // result DISCARDED

    expect(tokensOf(base)).toEqual([]);
    expect(() => base.build().resolve(T.Service)).toThrow();
  });

  test('addFactory leaves the receiver empty', () => {
    const base = new ServiceManifest<'singleton'>();
    base.addFactory(T.Service, () => new Alpha(), [[]], 'singleton');

    expect(tokensOf(base)).toEqual([]);
    expect(() => base.build().resolve(T.Service)).toThrow();
  });

  test('addValue leaves the receiver empty', () => {
    const base = new ServiceManifest<'singleton'>();
    base.addValue(T.Config, { v: 1 });

    expect(tokensOf(base)).toEqual([]);
    expect(() => base.build().resolve(T.Config)).toThrow();
  });

  test('the pre-op manifest resolves exactly what it did before the op', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.add(T.Service, Alpha, [[]], 'singleton');

    const before = base.build().resolve<Alpha>(T.Service).which;
    // Every verb, all discarded — none may reach `base`.
    base.add(T.Service, Beta, [[]], 'singleton');
    base.addFactory(T.Service, () => new Beta(), [[]], 'singleton');
    base.addValue(T.Service, new Beta());
    base.removeAll(T.Service);

    expect(base.build().resolve<Alpha>(T.Service).which).toBe(before);
    expect(base.build().resolve<Alpha>(T.Service).which).toBe('alpha');
    expect(tokensOf(base)).toEqual([T.Service]);
  });
});

describe('the receiver is unchanged after every fluent modifier', () => {
  test('as() leaves the chain node it was called on untouched', () => {
    const base = new ServiceManifest<'singleton'>();
    const unscoped = base.add(T.Service, Alpha, [[]]);
    unscoped.as('singleton'); // DISCARDED

    // `unscoped` is still transient — a fresh instance per resolve even with the
    // singleton frame open. If `.as()` had mutated it, these would be identical.
    const root = unscoped.build().createScope('singleton');
    expect(root.resolve<Alpha>(T.Service)).not.toBe(root.resolve<Alpha>(T.Service));
  });

  test('withKey() leaves the chain node it was called on untouched', () => {
    const base = new ServiceManifest<'singleton'>();
    const unkeyed = base.add(T.Service, Alpha, [[]], 'singleton');
    unkeyed.withKey('k'); // DISCARDED

    // The registration is still under the BARE token, and no keyed token exists.
    const root = unkeyed.build();
    expect(root.resolve<Alpha>(T.Service)).toBeInstanceOf(Alpha);
    expect(root.tryResolve<Alpha>(T.Service, 'k')).toBeUndefined();
    expect(tokensOf(unkeyed)).toEqual([T.Service]);
  });

  test('withSignature() leaves the chain node it was called on untouched', () => {
    // `withSignature` is only type-reachable on a transformer-authored chain (the
    // plugin-less overloads consume the signature slot positionally), so the cast
    // reaches the runtime face the transformer would have handed us.
    class Holder {
      public constructor(public readonly dep: string) {}
    }
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a-dep');
    base = base.addValue(T.B, 'b-dep');

    const chain = base.add(T.Service, Holder, [[T.A]]);
    (chain as unknown as { withSignature(s: unknown): unknown; }).withSignature([[T.B]]); // DISCARDED

    expect(chain.build().resolve<Holder>(T.Service).dep).toBe('a-dep');
  });
});

describe('nodes are frozen', () => {
  test('the root node is frozen and rejects a write', () => {
    const base = new ServiceManifest<'singleton'>();

    expect(Object.isFrozen(base)).toBe(true);
    attemptWrite(base, 'smuggled');
    expect('smuggled' in base).toBe(false);
  });

  test('a chain node is frozen and rejects a write', () => {
    const chain = new ServiceManifest<'singleton'>().add(T.Service, Alpha, [[]]);

    expect(Object.isFrozen(chain)).toBe(true);
    attemptWrite(chain, 'smuggled');
    expect('smuggled' in chain).toBe(false);
  });

  test('a node produced by a modifier is frozen too', () => {
    const refined = new ServiceManifest<'singleton'>()
      .add(T.Service, Alpha, [[]])
      .as('singleton')
      .withKey('k');

    expect(Object.isFrozen(refined)).toBe(true);
    attemptWrite(refined, 'smuggled');
    expect('smuggled' in refined).toBe(false);
  });

  test('a node produced by removeAll is frozen', () => {
    const pruned = new ServiceManifest<'singleton'>()
      .add(T.Service, Alpha, [[]], 'singleton')
      .removeAll(T.Service);

    expect(Object.isFrozen(pruned)).toBe(true);
    attemptWrite(pruned, 'smuggled');
    expect('smuggled' in pruned).toBe(false);
  });
});

describe('build() snapshots the node it was called on', () => {
  test('building a MID-CHAIN node reflects that node only, not later additions', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a');
    const mid = base.addValue(T.B, 'b');
    const tip = mid.addValue(T.C, 'c');

    expect(mid.build().resolve<string>(T.B)).toBe('b');
    // `mid` predates T.C entirely.
    expect(() => mid.build().resolve(T.C)).toThrow();
    // ...while the tip sees all three.
    expect(tip.build().resolve<string>(T.C)).toBe('c');
    expect(tokensOf(mid)).toEqual([T.A, T.B]);
    expect(tokensOf(tip)).toEqual([T.A, T.B, T.C]);
  });

  test('building the same node twice yields two independent providers', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.add(T.Service, Alpha, [[]], 'singleton');

    const first = base.build().createScope('singleton');
    const second = base.build().createScope('singleton');

    // Same registration, distinct caches — one provider's singleton is not the
    // other's.
    expect(first.resolve<Alpha>(T.Service)).toBeInstanceOf(Alpha);
    expect(first.resolve<Alpha>(T.Service)).not.toBe(second.resolve<Alpha>(T.Service));
  });

  test('building does NOT close the chain — you can keep adding afterwards', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.add(T.Service, Alpha, [[]], 'singleton');

    const early = base.build();
    // Keep registering off the ALREADY-BUILT manifest.
    const later = base.add(T.Service, Beta, [[]], 'singleton').addValue(T.Config, 'late');

    // The earlier provider is untouched by everything registered after it.
    expect(early.resolve<Alpha>(T.Service).which).toBe('alpha');
    expect(() => early.resolve(T.Config)).toThrow();
    // The later manifest carries both.
    const lateProvider = later.build();
    expect(lateProvider.resolve<Beta>(T.Service).which).toBe('beta');
    expect(lateProvider.resolve<string>(T.Config)).toBe('late');
  });

  test('a built manifest can be branched twice with no cross-talk', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.add(T.Service, Alpha, [[]], 'singleton');
    base.build(); // seal once, then fork

    const withValue = base.addValue(T.Config, 'x');
    const withOther = base.addValue(T.Config, 'y');

    expect(withValue.build().resolve<string>(T.Config)).toBe('x');
    expect(withOther.build().resolve<string>(T.Config)).toBe('y');
    expect(() => base.build().resolve(T.Config)).toThrow();
  });
});

describe('removeAll returns a NEW manifest', () => {
  test('the original still resolves the removed token', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.add(T.Service, Alpha, [[]], 'singleton');

    const pruned = base.removeAll(T.Service);

    expect(base.build().resolve<Alpha>(T.Service)).toBeInstanceOf(Alpha);
    expect(() => pruned.build().resolve(T.Service)).toThrow();
  });

  test('it drops EVERY registration of the token, not just the last', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.Service, 'one');
    base = base.addValue(T.Service, 'two');
    base = base.addValue(T.Service, 'three');

    const pruned = base.removeAll(T.Service);

    // The collection view is the sharp test: last-wins resolution would look
    // "removed" even if only the tail entry had gone.
    expect(pruned.build().resolve<string[]>(`Array<${T.Service}>`)).toEqual([]);
    expect(base.build().resolve<string[]>(`Array<${T.Service}>`)).toEqual(['one', 'two', 'three']);
    expect(tokensOf(pruned)).toEqual([]);
  });

  test('it leaves other tokens — and their order — alone', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a');
    base = base.addValue(T.Service, 'gone');
    base = base.addValue(T.B, 'b');

    const pruned = base.removeAll(T.Service);

    expect(tokensOf(pruned)).toEqual([T.A, T.B]);
    expect(pruned.build().resolve<string>(T.A)).toBe('a');
    expect(pruned.build().resolve<string>(T.B)).toBe('b');
  });

  test('it removes the OPEN-template entry for that token as well', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    // Both an exact closing and the open template live under base `pkg:IBox`.
    base = base.add('pkg:IBox<$1>', Alpha, [[]], 'singleton');
    base = base.addValue('pkg:IBox', 'exact');

    const pruned = base.removeAll('pkg:IBox');

    // The template's canonical base IS `pkg:IBox`, so both go.
    expect(tokensOf(pruned)).toEqual([]);
    expect(() => pruned.build().resolve('pkg:IBox<pkg:IA>')).toThrow();
    // ...while the original still synthesizes the closing.
    expect(base.build().resolve<Alpha>('pkg:IBox<pkg:IA>')).toBeInstanceOf(Alpha);
  });

  test('removing a token that was never registered is a harmless new manifest', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.addValue(T.A, 'a');

    const pruned = base.removeAll(T.Service);

    expect(tokensOf(pruned)).toEqual([T.A]);
    expect(pruned.build().resolve<string>(T.A)).toBe('a');
  });
});

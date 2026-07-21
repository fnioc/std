import { ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest, ManifestEntry, Token } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// The ENTRY STREAM. A manifest is `Iterable<ManifestEntry>`: each node yields its
// predecessor's entries FIRST and its own LAST, so iteration order equals
// registration order — the order `seal()` buckets by, and therefore the order
// last-wins resolution and collection aggregation both see. THAT ORDER IS
// LOAD-BEARING, and so is the entry COUNT: a fluent modifier that appended a
// shadow entry instead of replacing its own node would leave last-wins resolution
// looking correct while quietly doubling every `Array<T>` aggregate.

class Alpha {
  public readonly which = 'alpha';
}

class Beta {
  public readonly which = 'beta';
}

class Gamma {
  public readonly which = 'gamma';
}

/** The entry stream's tokens, in registration order — `open` entries by base. */
function tokensOf(manifest: Iterable<ManifestEntry>): string[] {
  return [...manifest].map((entry) => (entry.kind === 'exact' ? entry.token : entry.base));
}

describe('iteration yields entries in REGISTRATION order, inner-first', () => {
  test('a straight chain comes out in the order it was authored', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a');
    services = services.addValue(T.B, 'b');
    services = services.addValue(T.C, 'c');

    expect(tokensOf(services)).toEqual([T.A, T.B, T.C]);
  });

  test('the order survives mixed registration verbs', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.add(T.A, Alpha, [[]], 'singleton');
    services = services.addFactory(T.B, () => new Beta(), [[]], 'singleton');
    services = services.addValue(T.C, new Gamma());

    expect(tokensOf(services)).toEqual([T.A, T.B, T.C]);
  });

  test('an EMPTY manifest yields nothing', () => {
    expect(tokensOf(new ServiceManifest<'singleton'>())).toEqual([]);
  });

  test('iteration is repeatable — the stream is not consumed', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a');
    services = services.addValue(T.B, 'b');

    expect(tokensOf(services)).toEqual([T.A, T.B]);
    expect(tokensOf(services)).toEqual([T.A, T.B]); // again, same answer
  });

  test('the chain is walked from the ROOT forward, whatever the branch depth', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    for (const token of [T.A, T.B, T.C, T.Config, T.Service]) {
      services = services.addValue(token, token);
    }

    expect(tokensOf(services)).toEqual([T.A, T.B, T.C, T.Config, T.Service]);
  });
});

describe('last-wins resolution follows the entry stream', () => {
  test('a later add of the same token overrides an earlier one for bare-T', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.add(T.Service, Alpha, [[]], 'singleton');
    services = services.add(T.Service, Beta, [[]], 'singleton');
    services = services.add(T.Service, Gamma, [[]], 'singleton');

    // Three entries retained, the LAST one wins.
    expect(tokensOf(services)).toEqual([T.Service, T.Service, T.Service]);
    expect(services.build().resolve<Gamma>(T.Service).which).toBe('gamma');
  });

  test('last-wins is decided by the entry stream, not by which BRANCH added last', () => {
    let base: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    base = base.add(T.Service, Alpha, [[]], 'singleton');

    // `beta` is created first in wall-clock order but each branch is its own
    // stream, so each resolves ITS OWN tail.
    const beta = base.add(T.Service, Beta, [[]], 'singleton');
    const gamma = base.add(T.Service, Gamma, [[]], 'singleton');

    expect(beta.build().resolve<Beta>(T.Service).which).toBe('beta');
    expect(gamma.build().resolve<Gamma>(T.Service).which).toBe('gamma');
    expect(base.build().resolve<Alpha>(T.Service).which).toBe('alpha');
  });
});

describe('collection aggregation enumerates EVERY registration, in order', () => {
  const ARRAY: Token = `Array<${T.Service}>`;
  const ITERABLE: Token = `Iterable<${T.Service}>`;

  test('Array<T> sees every registration of T in registration order', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Service, 'first');
    services = services.addValue(T.Service, 'second');
    services = services.addValue(T.Service, 'third');

    expect(services.build().resolve<string[]>(ARRAY)).toEqual(['first', 'second', 'third']);
  });

  test('Iterable<T> agrees with Array<T>', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Service, 'first');
    services = services.addValue(T.Service, 'second');

    const provider = services.build();
    expect([...provider.resolve<Iterable<string>>(ITERABLE)]).toEqual(
      provider.resolve<string[]>(ARRAY),
    );
  });

  test('the aggregate mirrors the entry stream one-for-one', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Service, 'v1');
    services = services.add(T.Service, Alpha, [[]], 'singleton');
    services = services.addFactory(T.Service, () => new Beta(), [[]], 'singleton');

    const entries = tokensOf(services).filter((token) => token === T.Service);
    const aggregate = services.build().resolve<unknown[]>(ARRAY);

    expect(aggregate).toHaveLength(entries.length);
    expect(aggregate[0]).toBe('v1');
    expect(aggregate[1]).toBeInstanceOf(Alpha);
    expect(aggregate[2]).toBeInstanceOf(Beta);
  });
});

describe('a modifier REPLACES its node — one chain is exactly ONE entry', () => {
  // The sharp tests. Resolution alone cannot catch a shadow entry (last-wins would
  // still pick the refined one); the entry COUNT and the collection aggregate can.

  test('.add(...).as(scope) contributes ONE entry, not two', () => {
    const services = new ServiceManifest<'singleton'>()
      .add(T.Service, Alpha, [[]])
      .as('singleton');

    expect(tokensOf(services)).toEqual([T.Service]);
    expect(services.build().resolve<unknown[]>(`Array<${T.Service}>`)).toHaveLength(1);
  });

  test('.add(...).withKey(key) contributes ONE entry — under the KEYED token only', () => {
    const services = new ServiceManifest<'singleton'>()
      .add(T.Service, Alpha, [[]], 'singleton')
      .withKey('k');

    // No leftover shadow under the bare token: the refined node REPLACED it.
    expect(tokensOf(services)).toEqual([`${T.Service}#k`]);
    expect(services.build().resolve<unknown[]>(`Array<${T.Service}>`)).toEqual([]);
  });

  test('.add(...).as(...).withKey(...) — still ONE entry after two refinements', () => {
    const services = new ServiceManifest<'singleton'>()
      .add(T.Service, Alpha, [[]])
      .as('singleton')
      .withKey('k');

    expect(tokensOf(services)).toEqual([`${T.Service}#k`]);
  });

  test('.addFactory(...).as(scope) contributes ONE entry', () => {
    const services = new ServiceManifest<'singleton'>()
      .addFactory(T.Service, () => new Alpha(), [[]])
      .as('singleton');

    expect(tokensOf(services)).toEqual([T.Service]);
    expect(services.build().resolve<unknown[]>(`Array<${T.Service}>`)).toHaveLength(1);
  });

  test('a refined chain does not shadow a PRIOR registration of the same token', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Service, 'earlier');
    services = services.add(T.Service, Alpha, [[]]).as('singleton');

    // Exactly two entries — the value, then the refined class. A shadow would
    // make it three and put an extra element in the aggregate.
    expect(tokensOf(services)).toEqual([T.Service, T.Service]);
    const aggregate = services.build().resolve<unknown[]>(`Array<${T.Service}>`);
    expect(aggregate).toHaveLength(2);
    expect(aggregate[0]).toBe('earlier');
    expect(aggregate[1]).toBeInstanceOf(Alpha);
  });

  test('a refinement does not disturb the position of LATER registrations', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a');
    services = services.add(T.Service, Alpha, [[]]).as('singleton');
    services = services.addValue(T.C, 'c');

    expect(tokensOf(services)).toEqual([T.A, T.Service, T.C]);
  });
});

describe('removeAll rebases the stream', () => {
  test('the survivors keep their relative order', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a');
    services = services.addValue(T.Service, 'gone-1');
    services = services.addValue(T.B, 'b');
    services = services.addValue(T.Service, 'gone-2');
    services = services.addValue(T.C, 'c');

    expect(tokensOf(services.removeAll(T.Service))).toEqual([T.A, T.B, T.C]);
  });

  test('registering AFTER a removeAll appends to the rebased stream', () => {
    let services: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
    services = services.addValue(T.A, 'a');
    services = services.addValue(T.Service, 'gone');
    services = services.removeAll(T.Service);
    services = services.addValue(T.Service, 'fresh');

    expect(tokensOf(services)).toEqual([T.A, T.Service]);
    expect(services.build().resolve<string[]>(`Array<${T.Service}>`)).toEqual(['fresh']);
  });
});

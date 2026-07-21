import { ServiceManifest } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// The `tryAdd*` / `replace*` descriptor verbs (di.core's
// `ServiceCollectionDescriptorExtensions`). Conditional-add registers only when
// the token is absent (first registration wins); replace strips existing
// registrations then adds anew. Exercised through build + resolve — all hand-fed,
// no transformer.

class First {
  public readonly which = 'first';
}

class Second {
  public readonly which = 'second';
}

describe('tryAdd (conditional class registration)', () => {
  test('registers when the token is absent', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.tryAdd(T.Service, First, [[]]);

    const which = services.build().resolve<First>(T.Service).which;
    expect(which).toBe('first');
  });

  test('is a no-op when the token is already registered — first wins', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.add(T.Service, First, [[]]);
    services = services.tryAdd(T.Service, Second, [[]]); // should NOT register

    // Last-wins resolution would yield Second if tryAdd had added it.
    expect(services.build().resolve<First>(T.Service).which).toBe('first');
  });

  test('tags the lifetime when it registers, via the positional scope arg', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.tryAdd(T.Service, First, [[]], 'singleton');

    const root = services.build().createScope('singleton');
    expect(root.resolve<First>(T.Service)).toBe(root.resolve<First>(T.Service));
  });

  test('a no-op tryAdd safely ignores its scope argument when already present', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.add(T.Service, First, [[]], 'singleton');
    // Token present: tryAdd is a no-op and must not throw, and must not register Second.
    expect(() => services.tryAdd(T.Service, Second, [[]], 'singleton')).not.toThrow();

    const root = services.build().createScope('singleton');
    expect(root.resolve<First>(T.Service).which).toBe('first');
  });
});

describe('tryAddFactory / tryAddValue (conditional)', () => {
  test('tryAddFactory registers only when absent', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.tryAddFactory(T.Service, () => new First(), [[]]);
    services = services.tryAddFactory(T.Service, () => new Second(), [[]]); // no-op

    expect(services.build().resolve<First>(T.Service).which).toBe('first');
  });

  test('tryAddValue registers only when absent — first value wins', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.tryAddValue(T.Config, { v: 1 });
    services = services.tryAddValue(T.Config, { v: 2 }); // no-op

    expect(services.build().resolve<{ v: number; }>(T.Config)).toEqual({ v: 1 });
  });
});

describe('replace (unconditional)', () => {
  test('replace swaps the registration — the replacement wins', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.add(T.Service, First, [[]]);
    services = services.replace(T.Service, Second, [[]]);

    expect(services.build().resolve<Second>(T.Service).which).toBe('second');
  });

  test('replace leaves exactly one registration (old ones removed)', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.add(T.Service, First, [[]]);
    services = services.add(T.Service, First, [[]]);
    services = services.replace(T.Service, Second, [[]]);

    // The collection aggregate holds only the replacement, not the two originals.
    const all = services.build().resolve<Second[]>(`Array<${T.Service}>`);
    expect(all).toHaveLength(1);
    expect(all[0]!.which).toBe('second');
  });

  test('replaceValue and replaceFactory swap the registration too', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Config, { v: 1 });
    services = services.replaceValue(T.Config, { v: 9 });
    expect(services.build().resolve<{ v: number; }>(T.Config)).toEqual({ v: 9 });

    let other = new ServiceManifest<'singleton'>();
    other = other.add(T.Service, First, [[]]);
    other = other.replaceFactory(T.Service, () => new Second(), [[]]);
    expect(other.build().resolve<Second>(T.Service).which).toBe('second');
  });

  test('replace on an absent token simply registers it', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.replace(T.Service, Second, [[]]);
    expect(services.build().resolve<Second>(T.Service).which).toBe('second');
  });
});

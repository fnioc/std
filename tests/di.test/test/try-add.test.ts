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
    const services = new ServiceManifest<'singleton'>();
    services.tryAdd(T.Service, First);

    const which = services.build().resolve<First>(T.Service).which;
    expect(which).toBe('first');
  });

  test('is a no-op when the token is already registered — first wins', () => {
    const services = new ServiceManifest<'singleton'>();
    services.add(T.Service, First);
    services.tryAdd(T.Service, Second); // should NOT register

    // Last-wins resolution would yield Second if tryAdd had added it.
    expect(services.build().resolve<First>(T.Service).which).toBe('first');
  });

  test('the returned continuation tags the lifetime when it registered', () => {
    const services = new ServiceManifest<'singleton'>();
    services.tryAdd(T.Service, First).as('singleton');

    const root = services.build().createScope('singleton');
    expect(root.resolve<First>(T.Service)).toBe(root.resolve<First>(T.Service));
  });

  test("the no-op continuation's .as() is safely ignored when already present", () => {
    const services = new ServiceManifest<'singleton'>();
    services.add(T.Service, First).as('singleton');
    // Token present: tryAdd returns a no-op continuation, .as() must not throw
    // and must not register Second.
    expect(() => services.tryAdd(T.Service, Second).as('singleton')).not.toThrow();

    const root = services.build().createScope('singleton');
    expect(root.resolve<First>(T.Service).which).toBe('first');
  });
});

describe('tryAddFactory / tryAddValue (conditional)', () => {
  test('tryAddFactory registers only when absent', () => {
    const services = new ServiceManifest<'singleton'>();
    services.tryAddFactory(T.Service, () => new First());
    services.tryAddFactory(T.Service, () => new Second()); // no-op

    expect(services.build().resolve<First>(T.Service).which).toBe('first');
  });

  test('tryAddValue registers only when absent — first value wins', () => {
    const services = new ServiceManifest<'singleton'>();
    services.tryAddValue(T.Config, { v: 1 });
    services.tryAddValue(T.Config, { v: 2 }); // no-op

    expect(services.build().resolve<{ v: number; }>(T.Config)).toEqual({ v: 1 });
  });
});

describe('replace (unconditional)', () => {
  test('replace swaps the registration — the replacement wins', () => {
    const services = new ServiceManifest<'singleton'>();
    services.add(T.Service, First);
    services.replace(T.Service, Second);

    expect(services.build().resolve<Second>(T.Service).which).toBe('second');
  });

  test('replace leaves exactly one registration (old ones removed)', () => {
    const services = new ServiceManifest<'singleton'>();
    services.add(T.Service, First);
    services.add(T.Service, First);
    services.replace(T.Service, Second);

    // The collection aggregate holds only the replacement, not the two originals.
    const all = services.build().resolve<Second[]>(`Array<${T.Service}>`);
    expect(all).toHaveLength(1);
    expect(all[0]!.which).toBe('second');
  });

  test('replaceValue and replaceFactory swap the registration too', () => {
    const services = new ServiceManifest<'singleton'>();
    services.addValue(T.Config, { v: 1 });
    services.replaceValue(T.Config, { v: 9 });
    expect(services.build().resolve<{ v: number; }>(T.Config)).toEqual({ v: 9 });

    const other = new ServiceManifest<'singleton'>();
    other.add(T.Service, First);
    other.replaceFactory(T.Service, () => new Second());
    expect(other.build().resolve<Second>(T.Service).which).toBe('second');
  });

  test('replace on an absent token simply registers it', () => {
    const services = new ServiceManifest<'singleton'>();
    services.replace(T.Service, Second);
    expect(services.build().resolve<Second>(T.Service).which).toBe('second');
  });
});

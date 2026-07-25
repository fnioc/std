import { ServiceManifest } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// The `tryAdd*` / `replace*` descriptor verbs (di.core's
// `ServiceManifestDescriptorAugmentations`). Conditional-add registers only when
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
    services = services.addClass(T.Service, First, [[]]);
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
    services = services.addClass(T.Service, First, [[]], 'singleton');
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
    services = services.addClass(T.Service, First, [[]]);
    services = services.replace(T.Service, Second, [[]]);

    expect(services.build().resolve<Second>(T.Service).which).toBe('second');
  });

  test('replace leaves exactly one registration (old ones removed)', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, First, [[]]);
    services = services.addClass(T.Service, First, [[]]);
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
    other = other.addClass(T.Service, First, [[]]);
    other = other.replaceFactory(T.Service, () => new Second(), [[]]);
    expect(other.build().resolve<Second>(T.Service).which).toBe('second');
  });

  test('replace on an absent token simply registers it', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.replace(T.Service, Second, [[]]);
    expect(services.build().resolve<Second>(T.Service).which).toBe('second');
  });
});

// A keyed verb registers under the COMPOSED token `base#key`, so its dedup probe
// and its removal have to name that same composed token. Probing the bare base
// instead made a keyed add collide with an unrelated unkeyed registration.
describe('the keyed verbs probe and remove the COMPOSED token', () => {
  test('a keyed tryAdd registers even when the UNKEYED token is taken', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, First, [[]]);
    services = services.tryAdd(T.Service, Second, [[]], 'singleton', 'alt');

    const sp = services.build();
    expect(sp.resolve<First>(T.Service).which).toBe('first');
    expect(sp.resolve<Second>(T.Service, 'alt').which).toBe('second');
  });

  test('two tryAdds under DIFFERENT keys both register', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.tryAddValue(T.Config, { v: 1 }, 'a');
    services = services.tryAddValue(T.Config, { v: 2 }, 'b');

    const sp = services.build();
    expect(sp.resolve<{ v: number; }>(T.Config, 'a')).toEqual({ v: 1 });
    expect(sp.resolve<{ v: number; }>(T.Config, 'b')).toEqual({ v: 2 });
  });

  test('a keyed tryAdd is still a no-op when the KEYED token is taken', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Config, { v: 1 }, 'a');
    services = services.tryAddValue(T.Config, { v: 2 }, 'a');

    const all = services.build().resolve<Array<{ v: number; }>>(`Array<${T.Config}#a>`);
    expect(all).toEqual([{ v: 1 }]);
  });

  test('a keyed replace swaps the KEYED registration and leaves the unkeyed one alone', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, First, [[]]);
    services = services.addClass(T.Service, First, [[]], 'singleton', 'alt');
    services = services.replace(T.Service, Second, [[]], 'singleton', 'alt');

    const sp = services.build();
    expect(sp.resolve<First>(T.Service).which).toBe('first');
    const keyed = sp.resolve<Second[]>(`Array<${T.Service}#alt>`);
    expect(keyed).toHaveLength(1);
    expect(keyed[0]!.which).toBe('second');
  });

  test('replaceValue / replaceFactory honor the key too', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Config, { v: 1 });
    services = services.addValue(T.Config, { v: 2 }, 'a');
    services = services.replaceValue(T.Config, { v: 9 }, 'a');
    const sp = services.build();
    expect(sp.resolve<{ v: number; }>(T.Config)).toEqual({ v: 1 });
    expect(sp.resolve<{ v: number; }>(T.Config, 'a')).toEqual({ v: 9 });

    let other = new ServiceManifest<'singleton'>();
    other = other.addClass(T.Service, First, [[]]);
    other = other.replaceFactory(T.Service, () => new Second(), [[]], 'singleton', 'alt');
    const otherSp = other.build();
    expect(otherSp.resolve<First>(T.Service).which).toBe('first');
    expect(otherSp.resolve<Second>(T.Service, 'alt').which).toBe('second');
  });
});

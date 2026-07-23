import { ServiceManifest, union } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// Builder edge cases + the one-import re-export ergonomics.

describe('ServiceManifest.addClass runtime guard', () => {
  test('the type-only addClass<I>(ctor) form throws if invoked directly at runtime', () => {
    class Foo {}
    const services = new ServiceManifest<'singleton'>();
    // The transformer lowers addClass<I>(ctor) → addClass(token, ctor). Calling
    // the single-arg form at runtime (no transform) is a misuse — fail loud.
    expect(() => (services.addClass as (c: unknown) => unknown)(Foo)).toThrow(TypeError);
  });

  test('a later .addClass() for the same token overrides the earlier registration', () => {
    class First {
      public readonly which = 'first';
    }
    class Second {
      public readonly which = 'second';
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, First, [[]], 'singleton');
    services = services.addClass(T.Service, Second, [[]], 'singleton');

    const resolved = services.build().resolve<First | Second>(T.Service);
    expect(resolved.which).toBe('second');
  });
});

describe('re-exports from @rhombus-std/di.core', () => {
  test('union() constructs a Union slot with the given members', () => {
    const slot = union('pkg:IA', 'pkg:IB');
    expect(slot).toEqual({ union: ['pkg:IA', 'pkg:IB'] });
  });

  test('a hand-fed inline signature resolves through the engine end to end', () => {
    class DbImpl {
      public readonly kind = 'db';
    }
    class Consumer {
      public constructor(public readonly db: DbImpl) {}
    }

    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Db, DbImpl, [[]], 'singleton');
    // Signature rides on the registration (third `addClass` argument).
    services = services.addClass(T.Service, Consumer, [[T.Db]], 'singleton');

    const c = services.build().resolve<Consumer>(T.Service);
    expect(c.db).toBeInstanceOf(DbImpl);
  });
});

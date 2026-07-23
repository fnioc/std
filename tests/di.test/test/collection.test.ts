import { RESOLVER_TOKEN, ServiceManifest } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// The redesigned registration surface: the service collection
// (Map<Token, Registration[]>) with last-wins resolution, the three registration
// shapes (addClass / addFactory / addValue), and `build()` returning a frameless
// provider from which scopes are opened with `createScope`.

describe('service collection — last-wins over a retained list', () => {
  test('the most-recent class registration wins', () => {
    class First {
      public readonly which = 'first';
    }
    class Second {
      public readonly which = 'second';
    }
    class Third {
      public readonly which = 'third';
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, First, [[]], 'singleton');
    services = services.addClass(T.Service, Second, [[]], 'singleton');
    services = services.addClass(T.Service, Third, [[]], 'singleton');

    const resolved = services.build().resolve<Third>(T.Service);
    expect(resolved.which).toBe('third');
  });

  test('a later useValue overrides an earlier class registration', () => {
    class Real {
      public readonly which = 'real';
    }
    const fake = { which: 'fake' };
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, Real, [[]], 'singleton');
    services = services.addValue(T.Service, fake);

    expect(services.build().resolve<typeof fake>(T.Service)).toBe(fake);
  });

  test('a later class registration overrides an earlier addFactory', () => {
    class Winner {
      public readonly which = 'winner';
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.Service, () => ({ which: 'factory' }), [[]], 'singleton');
    services = services.addClass(T.Service, Winner, [[]], 'singleton');

    const resolved = services.build().resolve<Winner>(T.Service);
    expect(resolved).toBeInstanceOf(Winner);
    expect(resolved.which).toBe('winner');
  });

  test('multiple builder registrations for the same token — last-wins', () => {
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addValue(T.Config, 'v1');
    services = services.addValue(T.Config, 'v2');
    services = services.addValue(T.Config, 'v3');

    const root = services.build();
    // Most-recent (last appended) registration wins.
    expect(root.resolve<string>(T.Config)).toBe('v3');
    // Child scope sees the same sealed map — no local overrides exist.
    const req = root.createScope('request');
    expect(req.resolve<string>(T.Config)).toBe('v3');
  });
});

describe('the three registration shapes', () => {
  test('class — addClass(token, Ctor).as(scope) caches at the owning scope', () => {
    class Svc {
      public readonly id = Math.random();
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, Svc, [[]], 'singleton');

    const root = services.build().createScope('singleton');
    expect(root.resolve<Svc>(T.Service)).toBe(root.resolve<Svc>(T.Service));
  });

  test('factory — addFactory(token, fn).as(scope) resolves its own deps', () => {
    class Dep {
      public readonly kind = 'dep';
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Db, Dep, [[]], 'singleton');
    // A factory that wants the live provider declares it as a provider-typed
    // parameter — its token is the intrinsic `RESOLVER_TOKEN`, resolved to the
    // live view. The auto-`sp` escape hatch is gone.
    services = services.addFactory(T.Service, (s) => ({ dep: s.resolve<Dep>(T.Db) }), [[RESOLVER_TOKEN]], 'singleton');

    const root = services.build().createScope('singleton');
    const a = root.resolve<{ dep: Dep; }>(T.Service);
    const b = root.resolve<{ dep: Dep; }>(T.Service);
    expect(a).toBe(b); // .as("singleton") caches the result in the open singleton frame
    expect(a.dep).toBeInstanceOf(Dep);
  });

  test('value — addValue(token, value) returns the instance verbatim', () => {
    const value = { v: 1 };
    let services = new ServiceManifest<'singleton'>();
    services = services.addValue(T.Config, value);

    expect(services.build().resolve<typeof value>(T.Config)).toBe(value);
  });

  test('addFactory returns an AddChain for .as() chaining; addValue returns the plain manifest', () => {
    // addValue returns the new IServiceManifest directly (no chaining — values
    // have no lifetime to tag); addFactory returns an AddChain node exposing
    // `.as()` since the scope slot is still open.
    const services = new ServiceManifest<'singleton'>();
    const chain = services.addFactory(T.B, () => 2, [[]]);
    expect(typeof chain.as).toBe('function');
    // addValue is fire-and-forget here: just assert it does not throw.
    expect(() => services.addValue(T.A, 1)).not.toThrow();
  });
});

describe('build() frameless provider + opened scopes', () => {
  test('build() returns a frameless provider — .name throws until a scope is opened', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Logger, class L {}, [[]], 'singleton');
    const provider = services.build();
    expect(() => provider.name).toThrow();
    // Opening a scope gives the frame a name.
    expect(provider.createScope('singleton').name).toBe('singleton');
  });

  test('a scope opened from build() takes the name it was created with', () => {
    class App {
      public readonly kind = 'app';
    }
    let services = new ServiceManifest<'app' | 'request'>();
    services = services.addClass(T.Service, App, [[]], 'app');

    const app = services.build().createScope('app');
    expect(app.name).toBe('app');
    expect(app.resolve<App>(T.Service)).toBeInstanceOf(App);
  });

  test('child scopes nest from an opened scope via createScope', () => {
    class Req {
      public readonly id = Math.random();
    }
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addClass(T.Service, Req, [[]], 'request');

    const root = services.build().createScope('singleton');
    const reqA = root.createScope('request');
    const reqB = root.createScope('request');

    expect(reqA.name).toBe('request');
    expect(reqA.resolve<Req>(T.Service)).not.toBe(
      reqB.resolve<Req>(T.Service),
    );
  });

  test("an opened 'singleton' scope is a usable .as() target (singletons bind to it)", () => {
    class Shared {
      public readonly id = Math.random();
    }
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addClass(T.Service, Shared, [[]], 'singleton');

    const root = services.build().createScope('singleton');
    const deep = root.createScope('request').createScope('request');
    // Owned by the open "singleton" scope, shared across the whole subtree.
    expect(deep.resolve<Shared>(T.Service)).toBe(
      root.resolve<Shared>(T.Service),
    );
  });

  test("a 'singleton'-tagged registration resolved off the FRAMELESS provider is transient", () => {
    class Shared {
      public readonly id = Math.random();
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, Shared, [[]], 'singleton');

    const provider = services.build(); // no scope opened
    // No "singleton" frame is open ⇒ fresh instance per resolve, never cached.
    expect(provider.resolve<Shared>(T.Service)).not.toBe(
      provider.resolve<Shared>(T.Service),
    );
  });
});

describe('ServiceManifest type + construction surface', () => {
  test('(d) the ServiceManifest constructor takes no arguments', () => {
    // Zero-arg ctor: there is no rootName param — scopes are just tags.
    expect(new ServiceManifest().build).toBeInstanceOf(Function);
    expect(ServiceManifest.length).toBe(0); // declared ctor arity is 0
  });

  test('(e) a single scope-union generic governs .as() and createScope() tags', () => {
    // One generic param `Scopes`; both `.as(...)` and `createScope(...)` accept
    // exactly its members. This compiles only because the surface is single-param.
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addClass(
      T.Service,
      class S {
        public readonly id = Math.random();
      },
      [[]],
      'request',
    );

    const provider = services.build();
    const req = provider.createScope('request');
    const a = req.resolve<{ id: number; }>(T.Service);
    const b = req.resolve<{ id: number; }>(T.Service);
    expect(a).toBe(b); // request tag cached in the open request frame
  });
});

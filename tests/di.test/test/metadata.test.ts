import { CircularDependencyError, MissingMetadataError, ServiceManifest } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// Metadata handling: zero-arg ctor constructs directly; a ctor with params but
// no registration-carried signature throws with guidance. Plus cycle detection
// with the full path.

describe('missing metadata', () => {
  test('a zero-arg ctor is constructed directly (no dep lookup)', () => {
    class NoDeps {
      public readonly ok = true;
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, NoDeps, [[]], 'singleton');

    const instance = services.build().resolve<NoDeps>(
      T.Service,
    );
    expect(instance.ok).toBe(true);
  });

  test('a ctor with params but no metadata throws MissingMetadataError', () => {
    class NeedsParams {
      public constructor(public readonly a: unknown) {}
    }
    // No candidate signature — the transformer never saw it and it's un-annotated.
    // Under the mandatory-signatures API, "unannotated" is spelled `[]` (no
    // overloads to try at all), not `[[]]` (one zero-arg overload).
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, NeedsParams, [], 'singleton');

    const root = services.build();
    expect(() => root.resolve(T.Service)).toThrow(MissingMetadataError);
  });

  test('the MissingMetadataError names the ctor and the token', () => {
    class WidgetService {
      public constructor(public readonly a: unknown) {}
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, WidgetService, [], 'singleton');

    try {
      services.build().resolve(T.Service);
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingMetadataError);
      const e = err as MissingMetadataError;
      expect(e.ctorName).toBe('WidgetService');
      expect(e.token).toBe(T.Service);
      expect(e.message).toContain('signature');
      expect(e.message).toContain('factory');
    }
  });

  test('an empty-signatures list on a param ctor still throws', () => {
    class EdgeCase {
      public constructor(public readonly a: unknown) {}
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Service, EdgeCase, [], 'singleton'); // empty signatures

    expect(() => services.build().resolve(T.Service)).toThrow(MissingMetadataError);
  });
});

describe('cycle detection', () => {
  test('a direct A→B→A cycle throws with the full path', () => {
    class A {
      public constructor(public readonly b: unknown) {}
    }
    class B {
      public constructor(public readonly a: unknown) {}
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.A, A, [[T.B]], 'singleton');
    services = services.addClass(T.B, B, [[T.A]], 'singleton');

    const root = services.build();
    expect(() => root.resolve(T.A)).toThrow(CircularDependencyError);

    try {
      root.resolve(T.A);
    } catch (err) {
      const e = err as CircularDependencyError;
      // Path closes the loop: A → B → A.
      expect(e.path).toEqual([T.A, T.B, T.A]);
      expect(e.message).toContain(`${T.A} → ${T.B} → ${T.A}`);
    }
  });

  test('a self-cycle (A→A) throws', () => {
    class SelfRef {
      public constructor(public readonly self: unknown) {}
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.A, SelfRef, [[T.A]], 'singleton');

    const root = services.build();
    expect(() => root.resolve(T.A)).toThrow(CircularDependencyError);
  });

  test('a longer A→B→C→A cycle reports the full path', () => {
    class A {
      public constructor(public readonly b: unknown) {}
    }
    class B {
      public constructor(public readonly c: unknown) {}
    }
    class C {
      public constructor(public readonly a: unknown) {}
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.A, A, [[T.B]], 'singleton');
    services = services.addClass(T.B, B, [[T.C]], 'singleton');
    services = services.addClass(T.C, C, [[T.A]], 'singleton');

    try {
      services.build().resolve(T.A);
      throw new Error('expected a throw');
    } catch (err) {
      const e = err as CircularDependencyError;
      expect(e.path).toEqual([T.A, T.B, T.C, T.A]);
    }
  });

  test('a diamond (shared, non-cyclic dep) does NOT falsely trip', () => {
    // A depends on B and C; both B and C depend on D. D appears twice but on
    // separate branches — not a cycle. The stack is popped between branches.
    class D {
      public readonly id = 'D';
    }
    class B {
      public constructor(public readonly d: D) {}
    }
    class C {
      public constructor(public readonly d: D) {}
    }
    class A {
      public constructor(
        public readonly b: B,
        public readonly c: C,
      ) {}
    }
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(T.Db, D, [[]], 'singleton');
    services = services.addClass(T.B, B, [[T.Db]], 'singleton');
    services = services.addClass(T.C, C, [[T.Db]], 'singleton');
    services = services.addClass(T.A, A, [[T.B, T.C]], 'singleton');

    const a = services.build().createScope('singleton').resolve<A>(T.A);
    expect(a.b.d).toBe(a.c.d); // shared singleton D, no false cycle
  });
});

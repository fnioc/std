import { describe, expect, test } from 'bun:test';
import { fixture, transform } from './harness.js';

// Declaration-site anchoring: the registration verbs and resolution family lower
// ONLY when the called member resolves to a di.core authoring interface inside
// `declare module '@rhombus-std/di.core'`. Every receiver whose member resolves
// back there is lowered — an interface-typed variable, a subinterface, a user
// concrete class carrying `@augment` + the empty extends-merge, a generic bound —
// while an unrelated `.add()` / `.resolve()` (the false positives a pure name +
// arity match admitted) is left untouched.

describe('registration receiver-shape anchoring', () => {
  test('interface-typed receiver (the default `services`) is lowered', () => {
    const src = `
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      services.add<IFoo>(Foo).as<"singleton">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('services.add("./app:IFoo", Foo, [[]]).as("singleton")');
  });

  test('a subinterface of ServiceManifestBase is lowered', () => {
    const src = `
      import type { ServiceManifestBase } from "@rhombus-std/di.core";
      interface MyManifest extends ServiceManifestBase {}
      declare const reg: MyManifest;
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      reg.add<IFoo>(Foo).as<"singleton">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('reg.add("./app:IFoo", Foo, [[]]).as("singleton")');
    expect(output).not.toContain('reg.add<');
  });

  test('a user concrete class with @augment + the empty extends-merge is lowered', () => {
    // The owner's named scenario: a user-defined registration class implementing
    // the interface and decorated `@augment(...)`. The empty extends-merge binds
    // the interface's members onto the class, so `add` resolves to di.core's
    // ServiceManifestBase and anchors — the @augment decoration is runtime-only
    // and irrelevant to the type-level match.
    const src = `
      import type { ServiceManifestBase } from "@rhombus-std/di.core";
      declare function augment(token: string): <T>(target: T) => T;
      @augment("@rhombus-std/di.core:ServiceManifest")
      class MyRegistry {}
      interface MyRegistry extends ServiceManifestBase {}
      declare const reg: MyRegistry;
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      reg.add<IFoo>(Foo).as<"singleton">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('reg.add("./app:IFoo", Foo, [[]]).as("singleton")');
    expect(output).not.toContain('reg.add<');
  });

  test('new Set().add(v) is NOT lowered', () => {
    const src = `
      const s = new Set<string>();
      s.add("x");
    `;
    const { output } = transform(fixture(src));
    // The Set's add resolves to lib.es2015, not di.core — left verbatim.
    expect(output).toContain('s.add("x")');
    expect(output).not.toMatch(/s\.add\("[^"]*:[^"]*"/);
  });

  test('an unrelated repo.add(entity) is NOT lowered', () => {
    const src = `
      class Repo { add<T>(entity: T): void {} }
      declare const repo: Repo;
      repo.add<{ id: number }>({ id: 1 });
    `;
    const { output } = transform(fixture(src));
    // The type argument survives — a pure name+arity match would have wrongly
    // rewritten this into a token registration.
    expect(output).toContain('repo.add<');
  });

  test('an unrelated same-named local manifest class is NOT lowered', () => {
    const src = `
      class FakeManifest {
        add<I>(ctor: new() => I): { as<S extends string>(): void } {
          return { as() {} };
        }
      }
      declare const fake: FakeManifest;
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      fake.add<IFoo>(Foo).as<"singleton">();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('fake.add<');
    expect(output).not.toContain('fake.add("');
  });

  test('an anonymous/structural object receiver is NOT lowered (add)', () => {
    const src = `
      const bag = { add<I>(ctor: new() => I): { as(s: string): void } { return { as() {} }; } };
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      bag.add<IFoo>(Foo);
    `;
    const { output } = transform(fixture(src));
    // The anonymous object's add resolves to a type-literal member, not the
    // di.core interface — the type argument survives.
    expect(output).toContain('bag.add<');
    expect(output).not.toContain('bag.add("');
  });

  test('a namespace-nested ServiceManifestBase receiver is NOT lowered', () => {
    const src = `
      import type { Nested } from "@rhombus-std/di.core";
      declare const nested: Nested.ServiceManifestBase;
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      nested.add<IFoo>(Foo);
    `;
    const { output } = transform(fixture(src));
    // The nearest enclosing module scope is the \`Nested\` namespace, not the
    // \`@rhombus-std/di.core\` module — so the member is not the declaring one.
    expect(output).toContain('nested.add<');
    expect(output).not.toContain('nested.add("');
  });
});

describe('resolution receiver-shape anchoring', () => {
  test('resolve<T>() on a ServiceProvider receiver is lowered', () => {
    const src = `
      interface IFoo {}
      const foo = scope.resolve<IFoo>();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('scope.resolve("./app:IFoo")');
    expect(output).not.toContain('scope.resolve<');
  });

  test('resolve<T>() on a generic bound by Resolver is lowered', () => {
    const src = `
      import type { Resolver } from "@rhombus-std/di.core";
      interface IFoo {}
      function wire<R extends Resolver>(r: R) {
        return r.resolve<IFoo>();
      }
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('r.resolve("./app:IFoo")');
    expect(output).not.toContain('r.resolve<');
  });

  test('resolve<T>() on a non-Resolver object is NOT lowered', () => {
    const src = `
      class NotResolver { resolve<T>(): T { return {} as T; } }
      declare const nr: NotResolver;
      interface IFoo {}
      const foo = nr.resolve<IFoo>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('nr.resolve<');
    expect(output).not.toContain('nr.resolve("');
  });

  test('isService<T>() on a non-Resolver object is NOT lowered', () => {
    const src = `
      class NotResolver { isService<T>(): boolean { return false; } }
      declare const nr: NotResolver;
      interface IFoo {}
      const ok = nr.isService<IFoo>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('nr.isService<');
  });

  test('resolve<T>() on an anonymous/structural object is NOT lowered', () => {
    const src = `
      const bag = { resolve<T>(): T { return {} as T; } };
      interface IFoo {}
      const foo = bag.resolve<IFoo>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('bag.resolve<');
    expect(output).not.toContain('bag.resolve("');
  });

  test('resolve<T>() on a namespace-nested Resolver receiver is NOT lowered', () => {
    const src = `
      import type { Nested } from "@rhombus-std/di.core";
      declare const nested: Nested.Resolver;
      interface IFoo {}
      const foo = nested.resolve<IFoo>();
    `;
    const { output } = transform(fixture(src));
    expect(output).toContain('nested.resolve<');
    expect(output).not.toContain('nested.resolve("');
  });
});

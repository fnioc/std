import { DiagnosticCode } from '@rhombus-std/di.transformer/_/index';
import { describe, expect, test } from 'bun:test';
import { depsArrayFor, fixture, transform } from './harness.js';

// Dependency extraction → defineDeps emission (PRD §8). The emitted shape is the
// ABI `Token[][]`: an array of signatures, each a positional array of
// tokens / FactoryRef / Union / LiteralRef slots. There is no
// `null`/hole sentinel. Under Rule 1 EVERY named type tokenizes by its name —
// intrinsics (`string`, `number`, `boolean`, `any`, `unknown`, `void`, …) become
// their keyword as a token; an unregistered token simply misses at runtime, it is
// NOT a compile error. ONLY an anonymous inline structure (a `__type`/nameless
// non-intrinsic) still produces the hard UnderivableToken diagnostic.

describe('dependency extraction', () => {
  test('primitive parameter types tokenize by their keyword (Rule 1, no diagnostics)', () => {
    // Rule 1: every named type — including the intrinsics — tokenizes by its
    // name. `string`/`number`/`boolean` are NOT a compile error; they become the
    // bare tokens "string"/"number"/"boolean" and simply miss at runtime when
    // unregistered.
    const src = `
      interface IMarker {}
      class Prims implements IMarker {
        constructor(
          a: string,
          b: number,
          c: boolean,
        ) {}
      }
      services.add<IMarker>(Prims).as<"singleton">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(
      diagnostics.filter((d) => d.code === DiagnosticCode.UnderivableToken).length,
    ).toBe(0);
    expect(depsArrayFor(output, 'Prims')).toBe('[["string", "number", "boolean"]]');
  });

  test('any / unknown tokenize (Rule 1); void supplies undefined (Rule 2)', () => {
    // any / unknown tokenize by keyword. `void` is a singleton type (one
    // inhabitant), so it supplies `undefined` directly as a LiteralRef — NOT a
    // token. `void` is not `| undefined` (no Undefined flag), so it is not an
    // optional param: no overload drop, a single signature.
    const src = `
      interface IMarker {}
      class Tops implements IMarker {
        constructor(a: any, b: unknown, c: void) {}
      }
      services.add<IMarker>(Tops).as<"singleton">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(
      diagnostics.filter((d) => d.code === DiagnosticCode.UnderivableToken).length,
    ).toBe(0);
    expect(depsArrayFor(output, 'Tops')).toBe(
      '[["any", "unknown", { value: void 0 }]]',
    );
  });

  test('whole-type undefined / null params supply their value (Rule 2)', () => {
    const src = `
      interface IMarker {}
      class Nullish implements IMarker {
        constructor(a: undefined, b: null) {}
      }
      services.add<IMarker>(Nullish).as<"singleton">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    expect(
      diagnostics.filter((d) => d.code === DiagnosticCode.UnderivableToken).length,
    ).toBe(0);
    // `a: undefined` is a trailing-from-the-left optional? No — `b: null` is not
    // optional (null ≠ undefined), so `a: undefined` is interior. An interior
    // whole-type `undefined` is still a singleton LiteralRef (Rule 2), and `b:
    // null` supplies null. Neither earns an overload drop (b is required).
    expect(depsArrayFor(output, 'Nullish')).toBe(
      '[[{ value: void 0 }, { value: null }]]',
    );
  });

  test('anonymous inline structure STILL hard-errors (Rule 1 exception)', () => {
    // The ONLY remaining UnderivableToken case: an anonymous structural type with
    // no name (a `__type` symbol). It has no token, so it is a hard error.
    const src = `
      interface IMarker {}
      class Anon implements IMarker {
        constructor(a: { x: number }) {}
      }
      services.add<IMarker>(Anon).as<"singleton">();
    `;
    const { diagnostics } = transform(fixture(src));
    const errs = diagnostics.filter((d) => d.code === DiagnosticCode.UnderivableToken);
    expect(errs.length).toBe(1);
    expect(errs[0]!.category).toBe(1 /* ts.DiagnosticCategory.Error */);
  });

  test('tokens for interface parameters', () => {
    const src = `
      interface ILogger {}
      interface IDb {}
      interface IMarker {}
      class Svc implements IMarker {
        constructor(log: ILogger, db: IDb) {}
      }
      services.add<IMarker>(Svc).as<"singleton">();
    `;
    const { output } = transform(fixture(src));
    expect(depsArrayFor(output, 'Svc')).toBe('[["./app:ILogger", "./app:IDb"]]');
  });

  test('mixed multi-param ctor: every param tokenizes, including the `string` (Rule 1)', () => {
    const src = `
      interface ILogger {}
      interface IDbConnection {}
      interface IUserRepo {}
      class SqlUserRepo implements IUserRepo {
        constructor(log: ILogger, db: IDbConnection, table: string) {}
      }
      services.add<IUserRepo>(SqlUserRepo).as<"request">();
    `;
    const { output, diagnostics } = transform(fixture(src));
    // The `string` param no longer errors — it tokenizes to the bare "string".
    expect(
      diagnostics.filter((d) => d.code === DiagnosticCode.UnderivableToken).length,
    ).toBe(0);
    expect(depsArrayFor(output, 'SqlUserRepo')).toBe(
      '[["./app:ILogger", "./app:IDbConnection", "string"]]',
    );
  });

  test('class is registered, emits exactly one signature (array-of-one)', () => {
    const src = `
      interface IFoo {}
      class Foo implements IFoo { constructor() {} }
      services.add<IFoo>(Foo).as<"singleton">();
    `;
    const { output } = transform(fixture(src));
    const arr = depsArrayFor(output, 'Foo');
    // Outer array has exactly one element (one signature), empty (no params).
    expect(arr).toBe('[[]]');
  });

  test('class type parameter resolves to a token (not a hole)', () => {
    // A concrete class (not an interface) used as a ctor param type is still a
    // resolvable token.
    const src = `
      interface IMarker {}
      class Logger {}
      class Svc implements IMarker {
        constructor(log: Logger) {}
      }
      services.add<IMarker>(Svc).as<"singleton">();
    `;
    const { output } = transform(fixture(src));
    expect(depsArrayFor(output, 'Svc')).toBe('[["./app:Logger"]]');
  });

  test('a `IResolver`-typed param emits the intrinsic provider token, not a scope slot', () => {
    // The provider is a normally-resolvable type now: a `IResolver` parameter
    // tokenizes like any other named type (no dedicated `{ scope: true }` slot).
    // The derived token is the one the engine recognizes as the provider.
    // A REAL `@rhombus-std/di.core` package (not the ambient module) so a
    // `IResolver` param tokenizes as the package `@rhombus-std/di.core:IResolver`.
    // Its index self-augments a `declare module` block with the sugar overload, so
    // the `services` receiver's `add` still anchors on the declaration site.
    const files = {
      '/proj/node_modules/@rhombus-std/di.core/package.json': JSON.stringify({
        name: '@rhombus-std/di.core',
        version: '1.0.0',
        exports: { '.': './index.js' },
      }),
      '/proj/node_modules/@rhombus-std/di.core/index.d.ts': `
        export interface AddBuilder<Scopes extends string = string> { as(scope: Scopes): void; }
        export interface IRequiredResolver { resolve<T>(token: string): T; }
        export interface IServiceQuery { isService(token: string): boolean; }
        export interface IResolver extends IRequiredResolver, IServiceQuery {}
        export interface IServiceProvider<S extends string = string> extends IResolver {}
        export interface ServiceManifestBase<Scopes extends string = string, Provider = unknown> {
          add(token: string, ctor: new(...a: any[]) => unknown, signatures?: readonly (readonly unknown[])[]): AddBuilder<Scopes>;
        }
        export type ServiceManifest<S extends string = string> = ServiceManifestBase<S, IServiceProvider<S>>;
        declare module "@rhombus-std/di.core" {
          interface ServiceManifestBase<Scopes extends string = string, Provider = unknown> {
            add<I>(ctor: new(...a: any[]) => I): AddBuilder<Scopes>;
          }
        }
      `,
      '/proj/di-core.receivers.d.ts': `
        import type { ServiceManifest } from "@rhombus-std/di.core";
        declare global { const services: ServiceManifest<string>; }
      `,
      '/proj/src/app.ts': `
        import type { IResolver } from "@rhombus-std/di.core";
        interface IMarker {}
        class Svc implements IMarker {
          constructor(sp: IResolver) {}
        }
        services.add<IMarker>(Svc).as<"singleton">();
      `,
    };
    const { outputs } = transform(files, { entry: ['/proj/src/app.ts'] });
    const out = outputs['/proj/src/app.ts']!;
    expect(depsArrayFor(out, 'Svc')).toBe('[["@rhombus-std/di.core:IResolver"]]');
    expect(out).not.toContain('scope: true');
  });
});

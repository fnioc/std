// Lowering unit tests for the `addOptions<T>()` sugar.
//
// The sugar rewrites to the explicit verb `addOptions(token(Options<T>),
// token(T))`: the wrapper token is the closed-generic form over the SAME element
// token any `resolve<T>()` / `add<T>()` would derive, so the two arguments are
// relationally locked (`wrapper === "@rhombus-std/options:Options<" + element + ">"`).

import { DiagnosticCode } from '@rhombus-std/di.transformer.options/_/diagnostics';
import { describe, expect, test } from 'bun:test';
import { addOptionsArgs, fixtureWithoutOptions, optionsFixture, transform } from './harness';

describe('addOptions<T>() lowering', () => {
  test('lowers to addOptions(token(Options<T>), token(T)) over a package-public Options base', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        interface AppConfig { host: string; port: number; }
        services.addOptions<AppConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(0);

    const args = addOptionsArgs(output);
    expect(args).toBeDefined();
    // The element token is whatever this program derives for AppConfig; the
    // wrapper is the closed Options<> over exactly that — locked relationally.
    // The Options base tokenizes package-public regardless of T's own tier.
    expect(args!.wrapper).toBe(`@rhombus-std/options:Options<${args!.element}>`);
    expect(args!.element).toContain('AppConfig');
    // The `<T>` type argument is dropped from the CALL.
    expect(output).toContain('services.addOptions(');
    expect(output).not.toContain('services.addOptions<');
  });

  test('drops the type argument and preserves the .as() continuation', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        interface AppConfig { host: string; }
        services.addOptions<AppConfig>().as("singleton");
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`.as("singleton")`);
    expect(addOptionsArgs(output)).toBeDefined();
  });

  test('leaves the explicit two-arg verb untouched', () => {
    const src = `
      services.addOptions("some:OptionsToken", "some:ElementToken");
    `;
    const { output, diagnostics } = transform(optionsFixture(src));
    expect(diagnostics).toHaveLength(0);
    // No rewrite — the tokens the author wrote survive verbatim.
    expect(output).toContain(`addOptions("some:OptionsToken", "some:ElementToken")`);
  });

  test('does not touch addOptions on a non-ServiceManifest receiver', () => {
    const src = `
      const other = { addOptions<T>(): void {} } as { addOptions<T>(): void };
      other.addOptions<{ a: number }>();
    `;
    const { output } = transform(optionsFixture(src));
    // The generic call on a non-manifest receiver keeps its type argument.
    expect(output).toContain('other.addOptions<');
  });

  test('emits a diagnostic and leaves the call when Options is absent', () => {
    const { output, diagnostics } = transform(
      fixtureWithoutOptions(`
        interface AppConfig { host: string; }
        services.addOptions<AppConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(DiagnosticCode.UnlowerableAddOptions);
    // Left in place (still the type-arg form) so the runtime stub fires.
    expect(output).toContain('services.addOptions<');
  });

  test('distinct T types derive distinct wrapper tokens', () => {
    const { output } = transform(
      optionsFixture(`
        interface Alpha { a: string; }
        interface Beta { b: number; }
        services.addOptions<Alpha>();
        services.addOptions<Beta>();
      `),
    );
    expect(output).toContain('Alpha>');
    expect(output).toContain('Beta>');
  });
});

// The matcher anchors on the DECLARATION SITE of the `addOptions` member (its
// di.core `declare module` interface), not the receiver type's symbol name. So
// every receiver whose `addOptions` resolves back to `ServiceManifestBase` is
// lowered — a subinterface, a class carrying the empty extends-merge, a generic
// bound by the interface — while a type that merely shares the name is not.
describe('addOptions receiver-shape matching (declaration-site)', () => {
  test('interface-typed variable is lowered (the default `services` receiver)', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        interface AppConfig { host: string; }
        services.addOptions<AppConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(addOptionsArgs(output)).toBeDefined();
    expect(output).not.toContain('services.addOptions<');
  });

  test('a subinterface of ServiceManifestBase is lowered', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        interface MyManifest extends ServiceManifestBase {}
        declare const m: MyManifest;
        interface AppConfig { host: string; }
        m.addOptions<AppConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(addOptionsArgs(output)).toBeDefined();
    expect(output).not.toContain('m.addOptions<');
  });

  test('a class carrying the empty extends-merge is lowered', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        declare class MyThing {}
        interface MyThing extends ServiceManifestBase {}
        declare const thing: MyThing;
        interface AppConfig { host: string; }
        thing.addOptions<AppConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(addOptionsArgs(output)).toBeDefined();
    expect(output).not.toContain('thing.addOptions<');
  });

  test('a generic bound by ServiceManifestBase is lowered', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        interface AppConfig { host: string; }
        function useIt<M extends ServiceManifestBase>(m: M) {
          return m.addOptions<AppConfig>();
        }
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(addOptionsArgs(output)).toBeDefined();
    expect(output).not.toContain('m.addOptions<');
  });

  test('a local type merely NAMED ServiceManifest is NOT lowered (false-positive regression)', () => {
    const { output } = transform(
      optionsFixture(`
        type LocalBuilder<S extends string> = { as(scope: S): void };
        declare class ServiceManifest<S extends string = "singleton"> {
          addOptions<T>(): LocalBuilder<S>;
        }
        declare const local: ServiceManifest<"singleton">;
        interface AppConfig { host: string; }
        local.addOptions<AppConfig>();
      `),
    );
    // The old name-based matcher WOULD have lowered this (the receiver's symbol
    // is named `ServiceManifest`); declaration-site matching rejects it because
    // the member resolves to a local class, not the di.core interface.
    expect(output).toContain('local.addOptions<');
    expect(addOptionsArgs(output)).toBeUndefined();
  });

  test('an anonymous-object receiver is not lowered', () => {
    const { output } = transform(
      optionsFixture(`
        const other = { addOptions<T>(): void {} } as { addOptions<T>(): void };
        other.addOptions<{ a: number }>();
      `),
    );
    expect(output).toContain('other.addOptions<');
  });

  test('an interface nested in a namespace inside di.core is NOT lowered', () => {
    const { output, diagnostics } = transform(
      optionsFixture(`
        import type { Nested } from "@rhombus-std/di.core";
        declare const nested: Nested.ServiceManifestBase;
        interface AppConfig { host: string; }
        nested.addOptions<AppConfig>();
      `),
    );
    // The nearest enclosing module scope is the \`Nested\` namespace, not the
    // \`@rhombus-std/di.core\` module — so the member is not the declaring one.
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('nested.addOptions<');
    expect(addOptionsArgs(output)).toBeUndefined();
  });
});

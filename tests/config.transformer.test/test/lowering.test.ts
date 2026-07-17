import { describe, expect, test } from 'bun:test';
import { fixture, ROOT, transform } from './harness.js';

describe('withType -> withSchema lowering', () => {
  test('flat interface lowers to a schema literal with an OPTIONAL wrapper', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface ServerConfig { host: string; port: number; ssl?: boolean }
        const b = new ConfigBuilder().withType<ServerConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('.withSchema(');
    expect(output).not.toContain('.withType(');
    expect(output).toContain(`host: "string"`);
    expect(output).toContain(`port: "number"`);
    // Optional field wraps under the OPTIONAL computed key.
    expect(output).toContain(`ssl: { [OPTIONAL]: "boolean" }`);
  });

  test('nested objects recurse', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface AppConfig {
          Server: { Host: string; Port: number };
          Database: { Primary: { Host: string; PoolSize: number } };
        }
        const b = new ConfigBuilder().withType<AppConfig>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`Host: "string"`);
    expect(output).toContain(`Port: "number"`);
    expect(output).toContain(`PoolSize: "number"`);
    // The nested Database.Primary object recurses into its own literal.
    expect(output).toMatch(/Database:\s*\{\s*Primary:\s*\{/);
  });

  test('required boolean lowers to "boolean" (wide-boolean-before-union)', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Flags { flag: boolean }
        const b = new ConfigBuilder().withType<Flags>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`flag: "boolean"`);
  });

  test('property-name casing is preserved', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Server { Host: string; Port: number }
        const b = new ConfigBuilder().withType<Server>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`Host: "string"`);
    expect(output).toContain(`Port: "number"`);
    expect(output).not.toContain(`host:`);
    expect(output).not.toContain(`port:`);
  });

  test('receiver chain is preserved and the type argument dropped', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface T { a: string }
        declare const src: unknown;
        const b = new ConfigBuilder().add(src).withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toMatch(/\.add\(src\)\s*\.withSchema\(/);
    expect(output).not.toContain('.withType');
    // The <T> type argument must be gone.
    expect(output).not.toContain('withSchema<');
  });

  test('a non-ConfigBuilder .withType is left untouched', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface T { a: string }
        class Other { withType<U>(): Other { return this; } }
        const o = new Other().withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('new Other().withType<T>()');
    expect(output).not.toContain('.withSchema(');
  });
});

// The matcher anchors on the DECLARATION SITE of the `withType` member (config's
// `declare module '@rhombus-std/config'` ConfigBuilder interface), not the
// receiver type's symbol name. Every receiver whose `withType` resolves back to
// that interface lowers; a type that merely shares the name does not.
describe('withType receiver-shape matching (declaration-site)', () => {
  test('a subinterface of ConfigBuilder is lowered', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface MyBuilder extends ConfigBuilder {}
        declare const b: MyBuilder;
        interface T { host: string }
        b.withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('.withSchema(');
    expect(output).not.toContain('.withType<');
  });

  test('a class carrying the empty extends-merge is lowered', () => {
    const { output, diagnostics } = transform(
      fixture(`
        declare class MyBuilder {}
        interface MyBuilder extends ConfigBuilder {}
        declare const b: MyBuilder;
        interface T { host: string }
        b.withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('.withSchema(');
    expect(output).not.toContain('.withType<');
  });

  test('a generic bound by ConfigBuilder is lowered', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface T { host: string }
        function useIt<B extends ConfigBuilder>(b: B) {
          return b.withType<T>();
        }
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('.withSchema(');
    expect(output).not.toContain('.withType<');
  });

  test('an anonymous/structural object receiver is NOT lowered', () => {
    const { output, diagnostics } = transform(
      fixture(`
        const bag = { withType<U>(): { schema: U } { return {} as any; } };
        interface T { host: string }
        bag.withType<T>();
      `),
    );
    // The anonymous object's withType resolves to a type-literal member, not
    // config's declare-module interface — the call is left verbatim.
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('bag.withType<');
    expect(output).not.toContain('.withSchema(');
  });

  test('an interface nested in a namespace inside config is NOT lowered', () => {
    const { output, diagnostics } = transform(
      fixture(`
        import type { Nested } from "@rhombus-std/config";
        declare const nested: Nested.ConfigBuilder;
        interface T { host: string }
        nested.withType<T>();
      `),
    );
    // The nearest enclosing module scope is the \`Nested\` namespace, not the
    // \`@rhombus-std/config\` module — so the member is not the declaring one.
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('nested.withType<');
    expect(output).not.toContain('.withSchema(');
  });

  test('a local class merely NAMED ConfigBuilder is NOT lowered (false-positive regression)', () => {
    // No ambient config module and no header — a self-contained local class that
    // the OLD name-based matcher WOULD have lowered (its symbol is named
    // `ConfigBuilder`). Declaration-site matching rejects it: `withType`
    // resolves to a local class, not config's declare-module interface.
    const { output, diagnostics } = transform({
      [`${ROOT}/app.ts`]: `
        class ConfigBuilder<T = unknown> {
          withType<U>(): ConfigBuilder<U> { return this as any; }
          withSchema(schema: unknown): ConfigBuilder<unknown> { return this as any; }
        }
        interface T { a: string }
        const b = new ConfigBuilder().withType<T>();
      `,
    });
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('.withType<T>()');
    expect(output).not.toContain('.withSchema(');
  });
});

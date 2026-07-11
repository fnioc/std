import { describe, expect, test } from 'bun:test';
import { fixture, transform } from './harness.js';

describe('withType -> withSchema lowering', () => {
  test('flat interface lowers to a schema literal with an OPTIONAL wrapper', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface ServerConfig { host: string; port: number; ssl?: boolean }
        const b = new ConfigurationBuilder().withType<ServerConfig>();
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
        const b = new ConfigurationBuilder().withType<AppConfig>();
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
        const b = new ConfigurationBuilder().withType<Flags>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`flag: "boolean"`);
  });

  test('property-name casing is preserved', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Server { Host: string; Port: number }
        const b = new ConfigurationBuilder().withType<Server>();
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
        const b = new ConfigurationBuilder().add(src).withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toMatch(/\.add\(src\)\s*\.withSchema\(/);
    expect(output).not.toContain('.withType');
    // The <T> type argument must be gone.
    expect(output).not.toContain('withSchema<');
  });

  test('a non-ConfigurationBuilder .withType is left untouched', () => {
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

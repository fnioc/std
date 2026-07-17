import { describe, expect, test } from 'bun:test';
import { fixture, transform } from './harness.js';

describe('OPTIONAL import injection', () => {
  test('injects the named import when absent', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface T { ssl?: boolean }
        const b = new ConfigBuilder().withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`import { OPTIONAL } from "@rhombus-std/config"`);
    expect(output).toContain(`ssl: { [OPTIONAL]: "boolean" }`);
  });

  test('does not duplicate an existing named import', () => {
    const { output, diagnostics } = transform(
      fixture(`
        import { OPTIONAL } from "@rhombus-std/config";
        interface T { ssl?: boolean }
        const b = new ConfigBuilder().withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    const occurrences = output.split(`import { OPTIONAL } from "@rhombus-std/config"`).length - 1;
    expect(occurrences).toBe(1);
    expect(output).toContain(`[OPTIONAL]: "boolean"`);
  });

  test('honors an aliased named import', () => {
    const { output, diagnostics } = transform(
      fixture(`
        import { OPTIONAL as OPT } from "@rhombus-std/config";
        interface T { ssl?: boolean }
        const b = new ConfigBuilder().withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`ssl: { [OPT]: "boolean" }`);
    // No new named import injected.
    expect(output).not.toContain(`import { OPTIONAL }`);
  });

  test('honors a namespace import', () => {
    const { output, diagnostics } = transform(
      fixture(`
        import * as cfg from "@rhombus-std/config";
        interface T { ssl?: boolean }
        const b = new ConfigBuilder().withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain(`ssl: { [cfg.OPTIONAL]: "boolean" }`);
    expect(output).not.toContain(`import { OPTIONAL }`);
  });

  test('no optional field means no injected import', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface T { host: string; port: number }
        const b = new ConfigBuilder().withType<T>();
      `),
    );
    expect(diagnostics).toHaveLength(0);
    expect(output).not.toContain(`import { OPTIONAL }`);
    expect(output).toContain('.withSchema(');
  });
});

import { DiagnosticCode } from '@rhombus-std/config.transformer/internal/diagnostics';
import { describe, expect, test } from 'bun:test';
import { fixture, transform } from './harness.js';

describe('hard diagnostics for unsupported types', () => {
  test('an array field raises UnsupportedType and the call is NOT rewritten', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Bad { tags: string[] }
        const b = new ConfigurationBuilder().withType<Bad>();
      `),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(DiagnosticCode.UnsupportedType);
    // No silent partial: the original .withType call is left in place.
    expect(output).toContain('.withType<Bad>()');
    expect(output).not.toContain('.withSchema(');
  });

  test('a union field raises UnsupportedType', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Bad { mode: string | number }
        const b = new ConfigurationBuilder().withType<Bad>();
      `),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(DiagnosticCode.UnsupportedType);
    expect(output).not.toContain('.withSchema(');
  });

  test('a Date field raises UnsupportedType (library-global guard)', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Bad { when: Date }
        const b = new ConfigurationBuilder().withType<Bad>();
      `),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(DiagnosticCode.UnsupportedType);
    expect(output).not.toContain('.withSchema(');
  });

  test('a bare-leaf type argument raises NonObjectRoot', () => {
    const { output, diagnostics } = transform(
      fixture(`
        const b = new ConfigurationBuilder().withType<string>();
      `),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(DiagnosticCode.NonObjectRoot);
    expect(output).not.toContain('.withSchema(');
  });

  test('a nested unsupported field aborts the WHOLE call rewrite', () => {
    const { output, diagnostics } = transform(
      fixture(`
        interface Bad { a: { bad: string[] } }
        const b = new ConfigurationBuilder().withType<Bad>();
      `),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(DiagnosticCode.UnsupportedType);
    expect(output).toContain('.withType<Bad>()');
    expect(output).not.toContain('.withSchema(');
  });
});

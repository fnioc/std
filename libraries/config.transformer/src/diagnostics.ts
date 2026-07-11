// Diagnostic plumbing for the transformer.
//
// The transformer surfaces compile-time information back to the user via the
// host's `addDiagnostic` hook (ts-patch wires this to tsc's diagnostic stream).
// We keep a thin `Diagnostic` alias over `ts.Diagnostic` plus a small set of
// stable codes so tests can assert on category + code without matching message
// text. Every code here is an ERROR -- the transformer never emits a warning
// and never a silent partial: an unsupported type aborts the whole call rewrite
// and reports a hard error.

import ts from 'typescript';

/** A diagnostic the transformer raises. Alias kept for call-site clarity. */
export type Diagnostic = ts.Diagnostic;

/** The sink the transformer writes diagnostics to (ts-patch supplies this). */
export interface DiagnosticSink {
  addDiagnostic(diagnostic: Diagnostic): number;
}

/**
 * Stable numeric codes for transformer-emitted diagnostics. The high offset
 * keeps them clear of TypeScript's own code space. These are part of the
 * transformer's observable surface -- tests assert on them.
 */
export enum DiagnosticCode {
  /**
   * A field's type has no runtime `Schema` representation -- a union (other
   * than the intrinsic `boolean`), an array/tuple, a function/callable, a
   * library global (`Date`/`Map`/`RegExp`/`Promise`), or an index-signature
   * record. A hard compile error; the whole `.withType` call is left
   * un-rewritten (no silent partial).
   */
  UnsupportedType = 992001,
  /**
   * The `.withType<T>()` type argument is not an object type -- a bare leaf
   * (`withType<string>()`) or other non-record. `withSchema` forbids a
   * bare-leaf top-level schema, so this is a hard compile error.
   */
  NonObjectRoot = 992002,
}

const SOURCE = '@rhombus-std/config.transformer';

/** Build an error diagnostic anchored at `node` in `file`. */
export function error(
  file: ts.SourceFile,
  node: ts.Node,
  code: DiagnosticCode,
  messageText: string,
): Diagnostic {
  return {
    file,
    start: node.getStart(file),
    length: node.getWidth(file),
    category: ts.DiagnosticCategory.Error,
    code,
    messageText,
    source: SOURCE,
  };
}

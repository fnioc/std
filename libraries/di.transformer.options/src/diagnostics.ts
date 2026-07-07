// Diagnostic plumbing for the options-sugar transformer.
//
// Mirrors the sibling transformers: a thin `Diagnostic` alias over
// `ts.Diagnostic` plus a stable code so tests assert on the code, not message
// text. The code sits in the same 9900xx band the di transformer uses, offset
// clear of TypeScript's own space and of di.transformer's own codes.

import ts from "typescript";

/** A diagnostic the transformer raises. */
export type Diagnostic = ts.Diagnostic;

/** The sink the transformer writes diagnostics to (ts-patch supplies this). */
export interface DiagnosticSink {
  addDiagnostic(diagnostic: Diagnostic): number;
}

/** Stable numeric codes for this transformer's diagnostics (observable surface). */
export enum DiagnosticCode {
  /**
   * `addOptions<T>()` could not be lowered: either `T` has no derivable token,
   * or the `@rhombus-std/options` `Options` type was not found in the program so
   * the wrapper token base could not be derived. The original call is left in
   * place; without the transformer it hits the runtime stub.
   */
  UnlowerableAddOptions = 990020,
}

const SOURCE = "@rhombus-std/di.transformer.options";

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

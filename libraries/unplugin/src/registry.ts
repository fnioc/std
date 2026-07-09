// The transform REGISTRY — the sub-plugin mechanism for the single unplugin
// `transform` hook.
//
// Each entry names one of the @rhombus-std ts-patch transformers and knows how to
// build that transformer's program-driven `ts` "before" TransformerFactory from a
// `ts.Program` + a diagnostic sink. The unified plugin composes the ACTIVE
// entries' factories into ONE `ts.transform` pass (see `program-service.ts`),
// mirroring exactly how `tspc` chains the same plugins today — four separate
// unplugin `transform` hooks would print→reparse between each and detach the
// files from the shared Program's SourceFiles.
//
// Every transformer publicly exports a ts-patch-INDEPENDENT seam returning a
// `ts.TransformerFactory<ts.SourceFile>`; this module is the one place that names
// those seams. `nameof` takes no sink (it only rewrites `nameof<T>()` and never
// raises a diagnostic); the other three surface `ts.Diagnostic`s through the sink.

import { createTransformerFactory as createConfigFactory } from "@rhombus-std/config.transformer";
import { createTransformerFactory as createDiFactory } from "@rhombus-std/di.transformer";
import { createTransformerFactory as createDiOptionsFactory } from "@rhombus-std/di.transformer.options";
import { createNameofTransformerFactory } from "@rhombus-std/primitives.transformer";
import ts from "typescript";

/**
 * The sink the diagnostic-emitting transformers write to. Structurally identical
 * to each transformer package's own `DiagnosticSink` — one shared object is
 * handed to all three so a single collection captures every file's diagnostics.
 */
export interface DiagnosticSink {
  addDiagnostic(diagnostic: ts.Diagnostic): number;
}

/** The registry keys — one per @rhombus-std transformer the host can compose. */
export type TransformName = "di" | "di-options" | "config" | "nameof";

/** A registry entry: how to build one transformer's before-factory. */
export interface TransformEntry {
  /**
   * Build this transformer's `ts.TransformerFactory` against `program`. The
   * factory is bound to that specific Program (its TypeChecker), so the caller
   * MUST rebuild when the Program instance changes.
   */
  build(program: ts.Program, sink: DiagnosticSink): ts.TransformerFactory<ts.SourceFile>;
}

/**
 * The transform registry. The `di`/`di-options`/`config` builders forward the
 * sink; `nameof` ignores it (it raises no diagnostics).
 */
export const TRANSFORMS: Record<TransformName, TransformEntry> = {
  di: {
    build(program, sink) {
      return createDiFactory(program, sink);
    },
  },
  "di-options": {
    build(program, sink) {
      return createDiOptionsFactory(program, sink);
    },
  },
  config: {
    build(program, sink) {
      return createConfigFactory(program, sink);
    },
  },
  nameof: {
    build(program) {
      return createNameofTransformerFactory(program);
    },
  },
};

/**
 * The default active set, in application order: registration lowering first
 * (`di`), then the `addOptions<T>()` satellite, then config's `.withType<T>()`,
 * then the leaf `nameof<T>()` rewrite. Order matches the `tspc` plugin list the
 * example apps configure today.
 */
export const DEFAULT_TRANSFORMS: readonly TransformName[] = ["di", "di-options", "config", "nameof"];

// The transformer harness.
//
// Two layers:
//   - `default` / `transform` export: the ts-patch PROGRAM transformer entry.
//     ts-patch calls it with `(program, config, extras)`; `extras.addDiagnostic`
//     is the diagnostic stream and `program.getTypeChecker()` is the type source.
//   - `createTransformerFactory(program, sink)`: the underlying
//     `ts.TransformerFactory<ts.SourceFile>` the tests drive directly against an
//     in-memory Program (no ts-patch needed to exercise the rewrite).
//
// Per SourceFile the visitor walks depth-first (children before parents, so a
// receiver chain / nested withType is handled first); when a visited node is a
// `<builder>.withType<T>()` call, it is rewritten to `<builder>.withSchema({...})`
// with the generated runtime schema literal and the `<T>` type argument dropped.
// If codegen fails (unsupported type / non-object root), the ORIGINAL call is
// left in place -- the hard diagnostic surfaces, and the un-rewritten call hits
// config's throwing stub if the compile error is ignored (never a silent
// partial). After the walk, an `OPTIONAL` import is injected if any optional
// field lowered to a wrapper.

import ts from 'typescript';
import { type CodegenContext, schemaLiteralForTypeNode } from './codegen.js';
import type { DiagnosticSink } from './diagnostics.js';
import { ensureOptionalImport, type OptionalRef, resolveOptionalBinding } from './inject.js';
import { isWithTypeCall } from './match.js';

/**
 * Create the `ts.TransformerFactory` that rewrites a SourceFile. Exposed so the
 * test harness can run the transformer against an in-memory Program without
 * ts-patch.
 */
export function createTransformerFactory(
  program: ts.Program,
  sink: DiagnosticSink,
): ts.TransformerFactory<ts.SourceFile> {
  const checker = program.getTypeChecker();

  return (context) => (sourceFile) => {
    const { factory } = context;
    const optionalRef: OptionalRef = resolveOptionalBinding(sourceFile, factory);

    const codegenCtx: CodegenContext = {
      checker,
      factory,
      sink,
      program,
      sourceFile,
      optionalRef,
    };

    const visit = (node: ts.Node): ts.Node => {
      // Depth-first: rewrite children (receiver chain, nested withType) first.
      const visited = ts.visitEachChild(node, visit, context);
      if (ts.isCallExpression(visited) && isWithTypeCall(visited, checker)) {
        return rewriteWithType(visited, codegenCtx);
      }
      return visited;
    };

    const rewritten = ts.visitEachChild(sourceFile, visit, context);
    return ensureOptionalImport(rewritten, optionalRef, factory);
  };
}

/**
 * Rewrite `<builder>.withType<T>()` -> `<builder>.withSchema({...})`. On codegen
 * failure returns the original call unchanged (the diagnostic already fired).
 */
function rewriteWithType(
  call: ts.CallExpression,
  ctx: CodegenContext,
): ts.Expression {
  const callee = call.expression as ts.PropertyAccessExpression;
  const typeArg = call.typeArguments![0]!;

  const result = schemaLiteralForTypeNode(typeArg, ctx);
  if (!result.ok) {
    return call;
  }

  return ctx.factory.updateCallExpression(
    call,
    ctx.factory.createPropertyAccessExpression(callee.expression, 'withSchema'),
    // Drop the `<T>` type argument.
    undefined,
    [result.literal],
  );
}

// ── ts-patch program-transformer entry ───────────────────────────────────────

/**
 * Extras shape ts-patch passes to a program transformer. We only need
 * `addDiagnostic`; `ts` is the originating TypeScript instance.
 */
interface ProgramTransformerExtras {
  readonly ts: typeof ts;
  addDiagnostic(diagnostic: ts.Diagnostic): number;
}

/**
 * The ts-patch PROGRAM transformer entry point. Configure in `tsconfig.json`:
 *
 * ```jsonc
 * {
 *   "compilerOptions": {
 *     "plugins": [{ "transform": "@rhombus-std/config.transformer", "import": "transform" }]
 *   }
 * }
 * ```
 *
 * It does NOT alter the Program (it returns the same instance); the rewrite runs
 * via the returned `before` transformer factory during emit, keeping TypeChecker
 * access while tsc drives the emit pipeline.
 */
export function transform(
  program: ts.Program,
  _config: unknown,
  extras: ProgramTransformerExtras,
): { before: ts.TransformerFactory<ts.SourceFile>; } {
  const sink: DiagnosticSink = {
    addDiagnostic: (d) => extras.addDiagnostic(d),
  };
  return { before: createTransformerFactory(program, sink) };
}

export default transform;

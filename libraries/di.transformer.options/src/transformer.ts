// The transformer harness.
//
// Two layers:
//   - `default` / `transform` export: the ts-patch PROGRAM transformer entry.
//     ts-patch calls it with `(program, config, extras)`; `extras.addDiagnostic`
//     is the diagnostic stream and `program.getTypeChecker()` is the type source.
//   - `createTransformerFactory(program, sink, options?)`: the underlying
//     `ts.TransformerFactory<ts.SourceFile>` tests drive directly against an
//     in-memory Program (no ts-patch needed).
//
// Per SourceFile the visitor walks depth-first; when a visited node is a
// `<manifest>.addOptions<T>()` sugar call, it is rewritten to the explicit verb
// `<manifest>.addOptions(token(IOptions<T>), token(T))` with the `<T>` type
// argument dropped. On a derivation failure the ORIGINAL call is left in place
// and a hard diagnostic surfaces — never a silent partial.
//
// This is a `@rhombus-std/di.transformer` SATELLITE: it imports that transformer's
// token machinery (`createTokenContext`, `deriveToken`, `baseTokenForSymbol`) so
// the tokens it emits are byte-identical to the main transformer's, and it emits
// only di registrations. It never imports the `@rhombus-std/di` RUNTIME.

import { createTokenContext, type TokenContext, type TokenContextOptions } from '@rhombus-std/primitives.transformer';
import ts from 'typescript';
import { DiagnosticCode, error, type IDiagnosticSink } from './diagnostics.js';
import { isAddOptionsSugarCall } from './match.js';
import { optionTokensFor, resolveOptionsBase } from './OptionTokens.js';

/**
 * Create the `ts.TransformerFactory` that rewrites a SourceFile. Exposed so the
 * test harness can run the transformer against an in-memory Program without
 * ts-patch.
 */
export function createTransformerFactory(
  program: ts.Program,
  sink: IDiagnosticSink,
  options: TokenContextOptions = {},
): ts.TransformerFactory<ts.SourceFile> {
  const tokenContext = createTokenContext(program, options);

  return (context) => (sourceFile) => {
    const { factory } = context;

    const visit = (node: ts.Node): ts.Node => {
      // Depth-first: rewrite children (receiver chain) first.
      const visited = ts.visitEachChild(node, visit, context);
      if (ts.isCallExpression(visited) && isAddOptionsSugarCall(visited, tokenContext.checker)) {
        return rewriteAddOptions(visited, program, tokenContext, sink, sourceFile, factory);
      }
      return visited;
    };

    return ts.visitEachChild(sourceFile, visit, context);
  };
}

/**
 * Rewrite `<manifest>.addOptions<T>()` → `<manifest>.addOptions("<IOptions<T>>", "<T>")`.
 * On any derivation failure returns the original call and emits a diagnostic.
 */
function rewriteAddOptions(
  call: ts.CallExpression,
  program: ts.Program,
  ctx: TokenContext,
  sink: IDiagnosticSink,
  sourceFile: ts.SourceFile,
  factory: ts.NodeFactory,
): ts.Expression {
  const callee = call.expression as ts.PropertyAccessExpression;
  const typeArg = call.typeArguments![0]!;

  const optionsBase = resolveOptionsBase(program, ctx);
  if (optionsBase === undefined) {
    sink.addDiagnostic(
      error(
        sourceFile,
        typeArg,
        DiagnosticCode.UnlowerableAddOptions,
        'cannot lower addOptions<T>(): the @rhombus-std/options `Options` type is '
          + 'not in the program, so the IOptions<T> wrapper token cannot be derived. '
          + 'Ensure @rhombus-std/options is a dependency.',
      ),
    );
    return call;
  }

  const tokens = optionTokensFor(typeArg, optionsBase, ctx);
  if (tokens === undefined) {
    sink.addDiagnostic(
      error(
        sourceFile,
        typeArg,
        DiagnosticCode.UnlowerableAddOptions,
        'cannot lower addOptions<T>(): no token can be derived for T — name the '
          + 'options type (an anonymous inline object type has no stable token).',
      ),
    );
    return call;
  }

  // Drop the `<T>` type argument; emit the two string tokens.
  return factory.updateCallExpression(call, callee, undefined, [
    factory.createStringLiteral(tokens.wrapper),
    factory.createStringLiteral(tokens.element),
  ]);
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
 * The ts-patch PROGRAM transformer entry point. Configure in `tsconfig.json`
 * ALONGSIDE `@rhombus-std/di.transformer`:
 *
 * ```jsonc
 * {
 *   "compilerOptions": {
 *     "plugins": [
 *       { "transform": "@rhombus-std/di.transformer", "import": "transform" },
 *       { "transform": "@rhombus-std/di.transformer.options", "import": "transform" }
 *     ]
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
  const sink: IDiagnosticSink = {
    addDiagnostic: (d) => extras.addDiagnostic(d),
  };
  return { before: createTransformerFactory(program, sink) };
}

export default transform;

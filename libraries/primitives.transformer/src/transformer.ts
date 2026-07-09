// The `@rhombus-std/primitives.transformer` ts-patch entry -- a MINIMAL,
// di-independent transformer that rewrites ONLY `nameof<T>()` calls to their
// derived string token at compile time.
//
// It exists so a di-free package (config, logging, any family that mints
// augmentation tokens with the `nameof<T>()` sugar) can wire token generation
// WITHOUT pulling `@rhombus-std/di.transformer` -- which additionally lowers
// registration statements and rewrites `resolve<T>()`, neither of which a
// non-di author wants in scope.
//
// It shares the exact token-derivation machinery `di.transformer` uses
// (`createTokenContext` + `deriveToken`), so a `nameof<T>()` this rewrites is
// byte-identical to the same call rewritten by di.transformer. Rewriting is
// idempotent across double-wiring: a program configured with both this and
// di.transformer has each `nameof<T>()` consumed by whichever plugin runs
// first; the other simply finds no `nameof` calls left.

import type { Func } from "@rhombus-toolkit/func";
import ts from "typescript";
import { createTokenContext } from "./context.js";
import { NAMEOF_NAME } from "./nameof.js";
import { deriveToken, type TokenContext } from "./tokens.js";

/**
 * Create the `ts.TransformerFactory` that rewrites `nameof<T>()` calls in a
 * SourceFile. Exposed so a test harness can drive the transformer against an
 * in-memory Program without ts-patch.
 */
export function createNameofTransformerFactory(
  program: ts.Program,
  options: { readFile?: Func<[string], string | undefined> } = {},
): ts.TransformerFactory<ts.SourceFile> {
  const tokenContext = createTokenContext(program, options);
  return function factory(context) {
    return function transformFile(sourceFile) {
      const fileContext: FileContext = { ...tokenContext, factory: context.factory };
      return ts.factory.updateSourceFile(
        sourceFile,
        sourceFile.statements.map((statement) => rewriteNameof(statement, fileContext) as ts.Statement),
      );
    };
  };
}

interface FileContext extends TokenContext {
  readonly factory: ts.NodeFactory;
}

/** Rewrite every `nameof<T>()` call within `node` to its string token. */
function rewriteNameof(node: ts.Node, ctx: FileContext): ts.Node {
  function visit(n: ts.Node): ts.Node {
    if (ts.isCallExpression(n) && isNameofCall(n, ctx.checker)) {
      const typeArg = n.typeArguments![0]!;
      const type = ctx.checker.getTypeFromTypeNode(typeArg);
      const token = deriveToken(type, ctx);
      return ctx.factory.createStringLiteral(token ?? "");
    }
    return ts.visitEachChild(n, visit, undefined);
  }
  return visit(node);
}

/**
 * True when `call` is a single-type-argument call to `nameof`.
 *
 * Matches when EITHER the local callee name is `nameof` (the direct
 * `nameof<T>()` form, and the common case where the import is unresolved in a
 * lightweight Program) OR the resolved symbol's real name is `nameof` (so an
 * aliased import `import { nameof as keyOf }` still matches).
 */
function isNameofCall(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (!call.typeArguments || call.typeArguments.length !== 1) {
    return false;
  }
  const callee = call.expression;
  const id = ts.isIdentifier(callee)
    ? callee
    : ts.isPropertyAccessExpression(callee)
    ? callee.name
    : undefined;
  if (!id) {
    return false;
  }
  if (id.text === NAMEOF_NAME) {
    return true;
  }
  const symbol = checker.getSymbolAtLocation(callee);
  const target = symbol && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
  return target?.getName() === NAMEOF_NAME;
}

// ── ts-patch program-transformer entry ───────────────────────────────────────

/** Extras shape ts-patch passes to a program transformer. */
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
 *     "plugins": [{ "transform": "@rhombus-std/primitives.transformer", "import": "transform" }]
 *   }
 * }
 * ```
 *
 * It does NOT alter the Program (it returns the same instance); the rewrite runs
 * via the returned `before` transformer factory during emit.
 */
export function transform(
  program: ts.Program,
  _config: unknown,
  _extras: ProgramTransformerExtras,
): { before: ts.TransformerFactory<ts.SourceFile> } {
  return { before: createNameofTransformerFactory(program) };
}

export default transform;

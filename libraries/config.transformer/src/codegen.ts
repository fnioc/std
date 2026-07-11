// The one new algorithm: `ts.Type` -> runtime `Schema` object literal.
//
// Given the `.withType<T>()` type argument, synthesize the `withSchema({...})`
// literal the runtime coerces against. Leaves map to kind-name strings
// ("string" / "number" / "boolean"); nesting recurses into a nested object
// literal; an optional field wraps as `{ [OPTIONAL]: innerSchema }`.
//
// Correctness invariants:
//   - WIDE BOOLEAN before UNION. Intrinsic `boolean` is modeled as `false | true`
//     and carries BOTH the Union AND Boolean flags; it must be classified as
//     "boolean" before any union reaches the unsupported branch. `string | number`
//     has no Boolean bit and correctly falls through to a diagnostic.
//   - No explicit union branch. The runtime Schema has no union kind, so any
//     non-boolean union is unsupported by construction.
//   - Optionality is decided SOLELY by the `?` modifier (SymbolFlags.Optional),
//     matching `Infer<S>`. The inner type is stripped of null/undefined via
//     `getNonNullableType` before recursing.
//   - Unsupported anything aborts the WHOLE call rewrite (a `failed` flag) --
//     never a silent partial.

import ts from 'typescript';
import { DiagnosticCode, type DiagnosticSink, error } from './diagnostics.js';
import type { OptionalRef } from './inject.js';

/** The result of synthesizing a schema literal for a type node. */
export type CodegenResult =
  | { readonly ok: true; readonly literal: ts.Expression; }
  | { readonly ok: false; };

/** Shared context threaded through the codegen walk. */
export interface CodegenContext {
  readonly checker: ts.TypeChecker;
  readonly factory: ts.NodeFactory;
  readonly sink: DiagnosticSink;
  readonly program: ts.Program;
  readonly sourceFile: ts.SourceFile;
  readonly optionalRef: OptionalRef;
}

interface WalkState {
  failed: boolean;
}

/**
 * Synthesize the `withSchema` object literal for the `.withType<T>()` type
 * argument. Returns `{ ok: false }` (and pushes a diagnostic) if the root is
 * not an object type, or if any field is unsupported.
 */
export function schemaLiteralForTypeNode(
  typeNode: ts.TypeNode,
  ctx: CodegenContext,
): CodegenResult {
  const type = ctx.checker.getTypeFromTypeNode(typeNode);
  if (!isAcceptableRecord(type, ctx)) {
    ctx.sink.addDiagnostic(
      error(
        ctx.sourceFile,
        typeNode,
        DiagnosticCode.NonObjectRoot,
        'withType<T>() requires T to be an object type. A bare leaf or non-record '
          + 'type has no top-level schema; wrap your fields in an interface or '
          + 'object type.',
      ),
    );
    return { ok: false };
  }

  const state: WalkState = { failed: false };
  const literal = objectLiteralForType(type, typeNode, ctx, state);
  return state.failed ? { ok: false } : { ok: true, literal };
}

/** Build the `{ key: schema, ... }` literal for an accepted record type. */
function objectLiteralForType(
  type: ts.Type,
  anchor: ts.Node,
  ctx: CodegenContext,
  state: WalkState,
): ts.ObjectLiteralExpression {
  const properties: ts.ObjectLiteralElementLike[] = [];
  for (const sym of ctx.checker.getPropertiesOfType(type)) {
    const decl = sym.valueDeclaration ?? sym.declarations?.[0] ?? anchor;
    const propType = ctx.checker.getTypeOfSymbolAtLocation(sym, decl);
    const key = propertyKey(sym.getName(), ctx.factory);
    const optional = (sym.flags & ts.SymbolFlags.Optional) !== 0;

    if (optional) {
      // Strip null/undefined, then wrap: `{ [OPTIONAL]: innerSchema }`.
      const inner = ctx.checker.getNonNullableType(propType);
      const innerExpr = schemaForType(inner, decl, ctx, state);
      ctx.optionalRef.used = true;
      const wrapper = ctx.factory.createObjectLiteralExpression(
        [
          ctx.factory.createPropertyAssignment(
            ctx.factory.createComputedPropertyName(ctx.optionalRef.expr),
            innerExpr,
          ),
        ],
        false,
      );
      properties.push(ctx.factory.createPropertyAssignment(key, wrapper));
    } else {
      properties.push(
        ctx.factory.createPropertyAssignment(
          key,
          schemaForType(propType, decl, ctx, state),
        ),
      );
    }
  }
  return ctx.factory.createObjectLiteralExpression(properties, true);
}

/**
 * Classify a leaf/nested type into its schema expression. ORDER IS LOAD-BEARING:
 * wide boolean is checked before any union handling.
 */
function schemaForType(
  type: ts.Type,
  anchor: ts.Node,
  ctx: CodegenContext,
  state: WalkState,
): ts.Expression {
  // 1. Wide boolean (`false | true`) FIRST -- it carries both Union and Boolean
  //    flags; must not fall through to the union/unsupported branch.
  if (type.flags & ts.TypeFlags.Boolean) {
    return ctx.factory.createStringLiteral('boolean');
  }
  // 2/3. String / number.
  if (type.flags & ts.TypeFlags.String) {
    return ctx.factory.createStringLiteral('string');
  }
  if (type.flags & ts.TypeFlags.Number) {
    return ctx.factory.createStringLiteral('number');
  }
  // 4. Nested record -> recurse.
  if (isAcceptableRecord(type, ctx)) {
    return objectLiteralForType(type, anchor, ctx, state);
  }
  // 5. Anything else (non-boolean union, array/tuple, function, library global,
  //    index-signature record, literal, ...) is unsupported.
  state.failed = true;
  ctx.sink.addDiagnostic(
    error(
      ctx.sourceFile,
      anchor,
      DiagnosticCode.UnsupportedType,
      'unsupported type for a configuration field. The runtime schema supports '
        + 'string, number, boolean, and nested object types only -- name the field '
        + 'with one of those (unions, arrays, functions, and library types like Date '
        + 'have no schema representation).',
    ),
  );
  // Emit a harmless placeholder; the failed flag aborts the whole rewrite.
  return ctx.factory.createStringLiteral('string');
}

/**
 * True when `type` is a plain user record we can recurse into: an object type
 * with no call/construct signatures, not an array/tuple, no index signature, and
 * not a library / third-party global (`Date`, `Map`, `RegExp`, `Promise`, ...).
 * Pure predicate -- pushes no diagnostics.
 */
function isAcceptableRecord(type: ts.Type, ctx: CodegenContext): boolean {
  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return false;
  }
  const { checker } = ctx;
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) {
    return false;
  }
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0) {
    return false;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return false;
  }
  if (checker.getIndexInfoOfType(type, ts.IndexKind.String) !== undefined) {
    return false;
  }
  if (checker.getIndexInfoOfType(type, ts.IndexKind.Number) !== undefined) {
    return false;
  }
  if (isLibraryOrExternal(type, ctx)) {
    return false;
  }
  return true;
}

/**
 * True when the type's symbol is declared entirely in a default library file or
 * under `node_modules` -- i.e. a built-in/third-party global (`Date`, `Map`,
 * `RegExp`, `Promise`, ...) rather than a user interface / type literal.
 */
function isLibraryOrExternal(type: ts.Type, ctx: CodegenContext): boolean {
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  const declarations = symbol?.getDeclarations();
  if (!declarations || declarations.length === 0) {
    return false;
  }
  return declarations.every((decl) => {
    const file = decl.getSourceFile();
    return (
      ctx.program.isSourceFileDefaultLibrary(file)
      || file.fileName.includes('/node_modules/')
    );
  });
}

/**
 * Build a property-name node that preserves the interface's exact casing:
 * a bare identifier when the name is a valid JS identifier, else a string
 * literal. `Host` stays `Host`.
 */
function propertyKey(name: string, factory: ts.NodeFactory): ts.PropertyName {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    ? factory.createIdentifier(name)
    : factory.createStringLiteral(name);
}

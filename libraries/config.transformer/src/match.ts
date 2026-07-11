// Recognizing `.withType<T>()` on a ConfigurationBuilder.
//
// `.withType` is @rhombus-std/config's documented Tier 2 authoring surface (opt-in
// via `import "@rhombus-std/config/with-type-augment"`). We match it structurally:
// a property-access call named `withType`, exactly one type argument, zero value
// arguments, whose receiver's type is symbol-named `ConfigurationBuilder`. The
// name-based receiver check mirrors the sibling transformer's approach -- a
// user-defined method of the same name on a ConfigurationBuilder-symboled type
// is expected to be config's `withType`.

import ts from 'typescript';

const WITH_TYPE_NAME = 'withType';
const BUILDER_NAME = 'ConfigurationBuilder';

/**
 * True when `call` is a `<receiver>.withType<T>()` call whose receiver's type
 * is (or resolves through) a `ConfigurationBuilder`.
 *
 * Requires: callee is a property access named `withType`; exactly ONE type
 * argument; ZERO value arguments; the receiver's type symbol (directly, via
 * alias, or via the apparent type -- which handles the generic instance
 * `ConfigurationBuilder<Infer<S>>`) is named `ConfigurationBuilder`.
 */
export function isWithTypeCall(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): boolean {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }
  if (callee.name.text !== WITH_TYPE_NAME) {
    return false;
  }
  if (!call.typeArguments || call.typeArguments.length !== 1) {
    return false;
  }
  if (call.arguments.length !== 0) {
    return false;
  }
  return receiverIsBuilder(callee.expression, checker);
}

/** True when `expr`'s type is (or resolves to) a `ConfigurationBuilder`. */
function receiverIsBuilder(
  expr: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  const type = checker.getTypeAtLocation(expr);
  if (typeNamedBuilder(type)) {
    return true;
  }
  // The generic instance `ConfigurationBuilder<Infer<S>>` presents its symbol
  // through the apparent type; check that too.
  return typeNamedBuilder(checker.getApparentType(type));
}

/** True when `type`'s symbol (or alias symbol) is named `ConfigurationBuilder`. */
function typeNamedBuilder(type: ts.Type): boolean {
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  return symbol?.getName() === BUILDER_NAME;
}

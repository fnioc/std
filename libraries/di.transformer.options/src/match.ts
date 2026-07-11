// Recognizing the `addOptions<T>()` sugar on a registration builder.
//
// The type-driven sugar is a property-access call named `addOptions`, exactly
// one type argument, ZERO value arguments, whose receiver is a `ServiceManifest`
// (the registration builder). The explicit verbs — `addOptions(token, tToken)`
// and the pipeline `addOptions(token, makeBase)` — carry value arguments and are
// left untouched (they are already the lowered form this sugar produces).
//
// The receiver check mirrors the sibling config transformer's `ConfigurationBuilder`
// match: a user-defined `addOptions<T>()` on a ServiceManifest-symboled receiver
// is expected to be this augmentation's sugar.

import ts from 'typescript';

const ADD_OPTIONS_NAME = 'addOptions';

// The registration builder's type symbol names: the public `ServiceManifest`
// alias, the `ServiceManifestBase` interface it expands to, and the concrete
// `ServiceManifestClass` a runtime `new ServiceManifest()` produces.
const MANIFEST_NAMES: ReadonlySet<string> = new Set([
  'ServiceManifest',
  'ServiceManifestBase',
  'ServiceManifestClass',
]);

/**
 * True when `call` is a tokenless `<manifest>.addOptions<T>()` sugar call:
 * callee is a property access named `addOptions`, exactly ONE type argument,
 * ZERO value arguments, and the receiver's type is (or resolves through) a
 * ServiceManifest.
 */
export function isAddOptionsSugarCall(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): boolean {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }
  if (callee.name.text !== ADD_OPTIONS_NAME) {
    return false;
  }
  if (!call.typeArguments || call.typeArguments.length !== 1) {
    return false;
  }
  if (call.arguments.length !== 0) {
    return false;
  }
  return receiverIsManifest(callee.expression, checker);
}

/** True when `expr`'s type is (or resolves to) a ServiceManifest. */
function receiverIsManifest(
  expr: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  const type = checker.getTypeAtLocation(expr);
  if (typeNamedManifest(type)) {
    return true;
  }
  // A generic instance surfaces its symbol through the apparent type.
  return typeNamedManifest(checker.getApparentType(type));
}

/** True when `type`'s symbol (or alias symbol) is a ServiceManifest name. */
function typeNamedManifest(type: ts.Type): boolean {
  const name = (type.getSymbol() ?? type.aliasSymbol)?.getName();
  return name !== undefined && MANIFEST_NAMES.has(name);
}

// Recognizing the `addOptions<T>()` sugar on a registration builder.
//
// The type-driven sugar is a property-access call named `addOptions`, exactly
// one type argument, ZERO value arguments, whose called member is the
// `addOptions<T>()` overload this satellite declaration-merges onto
// `@rhombus-std/di.core`'s registration-builder interfaces. The explicit verbs —
// `addOptions(token, tToken)` and the pipeline `addOptions(token, makeBase)` —
// carry value arguments and are left untouched (they are already the lowered
// form this sugar produces).
//
// The receiver is matched at the member's DECLARATION SITE, not by the receiver
// type's symbol name: we resolve the `addOptions` symbol at the call site and
// accept only when one of its declarations is an interface member on
// `ServiceManifestBase` / `ServiceManifestClass` declared inside the
// `declare module '@rhombus-std/di.core'` block that authors this augmentation.
// An inherited member keeps its original declaration, so a subinterface, a class
// carrying the repo's empty extends-merge, an interface-typed variable, or a
// generic `<M extends ServiceManifestBase>` all resolve back to that same
// declaration. An unrelated type that merely happens to spell a same-named
// `addOptions<T>()` resolves to its own declaration and is rejected.

import ts from 'typescript';

const ADD_OPTIONS_NAME = 'addOptions';

// The registration-builder interfaces the augmentation merges the sugar onto:
// `ServiceManifestBase` (which the public `ServiceManifest` alias resolves to)
// and the concrete `ServiceManifestClass`. `ServiceManifest` itself is a type
// ALIAS and declares no members, so it never anchors a declaration here.
const DECLARING_INTERFACES: ReadonlySet<string> = new Set([
  'ServiceManifestBase',
  'ServiceManifestClass',
]);

// The `declare module` specifier the sugar (and the explicit verbs) are declared
// against — the package that owns the registration-builder interfaces.
const DECLARING_MODULE = '@rhombus-std/di.core';

/**
 * True when `call` is a tokenless `<manifest>.addOptions<T>()` sugar call:
 * callee is a property access named `addOptions`, exactly ONE type argument,
 * ZERO value arguments, and the resolved `addOptions` member is declared on a
 * di.core registration-builder interface.
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
  return memberDeclaredOnManifest(callee.name, checker);
}

/**
 * True when the `addOptions` member referenced at `name` resolves to a symbol
 * with a declaration on a di.core registration-builder interface. A merged
 * property symbol carries declarations from every contributing merge, so any one
 * matching declaration suffices.
 */
function memberDeclaredOnManifest(
  name: ts.MemberName,
  checker: ts.TypeChecker,
): boolean {
  const symbol = checker.getSymbolAtLocation(name);
  const declarations = symbol?.getDeclarations();
  if (!declarations) {
    return false;
  }
  return declarations.some(declaredOnManifestInterface);
}

/**
 * True when `declaration`'s parent is a `ServiceManifestBase` /
 * `ServiceManifestClass` interface declared inside the
 * `declare module '@rhombus-std/di.core'` block.
 */
function declaredOnManifestInterface(declaration: ts.Declaration): boolean {
  const parent = declaration.parent;
  if (!ts.isInterfaceDeclaration(parent)) {
    return false;
  }
  if (!DECLARING_INTERFACES.has(parent.name.text)) {
    return false;
  }
  return interfaceIsInDeclaringModule(parent);
}

/**
 * True when `iface`'s enclosing `declare module` names {@link DECLARING_MODULE}.
 * The interface sits inside a `ModuleBlock` whose parent is the
 * `ModuleDeclaration`; its name is the string-literal specifier.
 */
function interfaceIsInDeclaringModule(iface: ts.InterfaceDeclaration): boolean {
  for (let node: ts.Node = iface.parent; node; node = node.parent) {
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      return node.name.text === DECLARING_MODULE;
    }
  }
  return false;
}

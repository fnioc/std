// Recognizing `.withType<T>()` on a ConfigurationBuilder.
//
// `.withType` is @rhombus-std/config's documented Tier 2 authoring surface (opt-in
// via `import "@rhombus-std/config/with-type-augment"`). We match it structurally:
// a property-access call named `withType`, exactly one type argument, zero value
// arguments, whose called member is config's `withType<U>()` augmentation.
//
// The receiver is matched at the member's DECLARATION SITE, not by the receiver
// type's symbol name: we resolve the `withType` symbol at the call site and
// accept only when one of its declarations is a member of the
// `ConfigurationBuilder` interface declared inside the
// `declare module '@rhombus-std/config'` block that authors this augmentation. An
// inherited member keeps its original declaration, so a subinterface, a class
// carrying an empty extends-merge, or an interface-typed variable all resolve
// back to that same declaration; an unrelated type spelling a same-named
// `withType` resolves to its own declaration and is rejected.

import ts from 'typescript';

const WITH_TYPE_NAME = 'withType';

// The interface config declaration-merges `withType<U>()` onto.
const DECLARING_INTERFACE = 'ConfigurationBuilder';

// The `declare module` specifier the augmentation is declared against.
const DECLARING_MODULE = '@rhombus-std/config';

/**
 * True when `call` is a `<receiver>.withType<T>()` call whose called member is
 * config's `ConfigurationBuilder.withType<U>()` augmentation.
 *
 * Requires: callee is a property access named `withType`; exactly ONE type
 * argument; ZERO value arguments; the resolved `withType` member is declared on
 * the `ConfigurationBuilder` interface inside `declare module '@rhombus-std/config'`.
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
  return memberDeclaredOnBuilder(callee.name, checker);
}

/**
 * True when the `withType` member referenced at `name` resolves to a symbol with
 * a declaration on config's `ConfigurationBuilder` interface. A merged property
 * symbol carries declarations from every contributing merge, so any one matching
 * declaration suffices.
 */
function memberDeclaredOnBuilder(
  name: ts.MemberName,
  checker: ts.TypeChecker,
): boolean {
  const symbol = checker.getSymbolAtLocation(name);
  const declarations = symbol?.getDeclarations();
  if (!declarations) {
    return false;
  }
  return declarations.some(declaredOnBuilderInterface);
}

/**
 * True when `declaration`'s parent is the `ConfigurationBuilder` interface
 * declared inside the `declare module '@rhombus-std/config'` block.
 */
function declaredOnBuilderInterface(declaration: ts.Declaration): boolean {
  const parent = declaration.parent;
  if (!ts.isInterfaceDeclaration(parent)) {
    return false;
  }
  if (parent.name.text !== DECLARING_INTERFACE) {
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

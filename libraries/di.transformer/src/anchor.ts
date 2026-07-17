// Declaration-site anchoring for di.transformer's receiver-borne authored forms.
//
// The registration verbs (`add` / `addFactory` / `addValue`), the `.as<>()`
// lifetime tag, and the tokenless resolution family (`resolve` / `resolveAsync` /
// `tryResolve` / `isService`) are lowered ONLY when the called member is one the
// transformer declaration-merges onto `@rhombus-std/di.core` (see `./augment.ts`).
//
// We resolve the member's symbol at the call site and accept only when one of its
// declarations sits on the owning di.core authoring interface inside
// `declare module '@rhombus-std/di.core'`. A merged property symbol carries ALL
// overload declarations — the runtime explicit form AND the transformer's sugar
// overload — so an explicit-form call anchors through the sugar's declare-module
// declaration. This kills the false positives a pure name+arity match admits
// (`new Set().add(v)`, an unrelated `repo.add(entity)`, `resolve` on a non-IResolver)
// while still matching a user's own concrete class that implements the interface and
// carries the empty extends-merge — its member resolves back to the same interface.
// An `any` receiver yields no symbol and is rejected.

import ts from 'typescript';

const DECLARING_MODULE = '@rhombus-std/di.core';

// The di.core authoring interface each matched member is declared on — its runtime
// overloads AND the transformer's sugar overloads share one interface:
//   add / addFactory / addValue → ServiceManifestBase
//   as                          → AddBuilder
//   resolve                     → IRequiredResolver
//   resolveAsync / tryResolve   → IResolver
//   isService                   → IServiceQuery
export const REGISTRATION_INTERFACES: ReadonlySet<string> = new Set(['ServiceManifestBase']);
export const AS_INTERFACES: ReadonlySet<string> = new Set(['AddBuilder']);
export const RESOLVE_INTERFACES: ReadonlySet<string> = new Set(['IRequiredResolver', 'IResolver']);
export const IS_SERVICE_INTERFACES: ReadonlySet<string> = new Set(['IServiceQuery']);

/**
 * True when the member referenced at `name` resolves to a symbol with ≥1
 * declaration on one of `declaringInterfaces` inside
 * `declare module '@rhombus-std/di.core'`.
 */
export function memberAnchoredOnDiCore(
  name: ts.MemberName,
  checker: ts.TypeChecker,
  declaringInterfaces: ReadonlySet<string>,
): boolean {
  const symbol = checker.getSymbolAtLocation(name);
  const declarations = symbol?.getDeclarations();
  if (!declarations) {
    return false;
  }
  return declarations.some((declaration) => declaredOnAuthoringInterface(declaration, declaringInterfaces));
}

/**
 * True when `declaration`'s parent is an interface named in `declaringInterfaces`
 * inside the `declare module '@rhombus-std/di.core'` block.
 */
function declaredOnAuthoringInterface(
  declaration: ts.Declaration,
  declaringInterfaces: ReadonlySet<string>,
): boolean {
  const parent = declaration.parent;
  if (!ts.isInterfaceDeclaration(parent)) {
    return false;
  }
  if (!declaringInterfaces.has(parent.name.text)) {
    return false;
  }
  return interfaceIsInDeclaringModule(parent);
}

/**
 * True when `iface`'s NEAREST enclosing module declaration is
 * `declare module '@rhombus-std/di.core'`. The nearest module scope decides: an
 * interface nested in a `namespace` inside the declaring module belongs to that
 * namespace, not the module, so it is rejected.
 */
function interfaceIsInDeclaringModule(iface: ts.InterfaceDeclaration): boolean {
  let node: ts.Node | undefined = iface.parent;
  while (node !== undefined) {
    if (ts.isModuleDeclaration(node)) {
      return ts.isStringLiteral(node.name) && node.name.text === DECLARING_MODULE;
    }
    node = node.parent;
  }
  return false;
}

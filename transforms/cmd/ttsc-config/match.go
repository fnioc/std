package main

// Recognizing `.withType<T>()` on a ConfigurationBuilder.
//
// `.withType` is the config family's opt-in authoring surface. It is matched
// structurally: a property-access call named `withType`, exactly one type
// argument, zero value arguments, whose called member is config's `withType<U>()`
// augmentation.
//
// The receiver is matched at the member's DECLARATION SITE, not by the receiver
// type's symbol name: we resolve the `withType` symbol at the call site and accept
// only when one of its declarations is a member of the `ConfigurationBuilder`
// interface declared inside the `declare module '@rhombus-std/config'` block that
// authors this augmentation. An inherited member keeps its original declaration,
// so a subinterface, a class carrying an empty extends-merge, or an
// interface-typed variable all resolve back to that same declaration; an
// unrelated same-named `withType` resolves to its own declaration and is rejected.

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

const (
	withTypeName = "withType"
	// declaringInterface is the interface config declaration-merges withType onto.
	declaringInterface = "ConfigurationBuilder"
	// declaringModule is the `declare module` specifier the augmentation targets.
	declaringModule = "@rhombus-std/config"
)

// isWithTypeCall reports whether call is a `<receiver>.withType<T>()` call whose
// called member is config's `ConfigurationBuilder.withType<U>()` augmentation. It
// requires a property-access callee named `withType`, exactly ONE type argument,
// ZERO value arguments, and a resolved `withType` member declared on the
// `ConfigurationBuilder` interface inside `declare module '@rhombus-std/config'`.
func isWithTypeCall(checker *shimchecker.Checker, call *shimast.CallExpression) bool {
	callee := call.Expression
	if callee == nil || callee.Kind != shimast.KindPropertyAccessExpression {
		return false
	}
	name := callee.Name()
	if name == nil || name.Text() != withTypeName {
		return false
	}
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return false
	}
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		return false
	}
	return memberDeclaredOnBuilder(checker, name)
}

// memberDeclaredOnBuilder reports whether the `withType` member referenced at name
// resolves to a symbol with a declaration on config's `ConfigurationBuilder`
// interface. A merged property symbol carries declarations from every contributing
// merge, so any one matching declaration suffices.
func memberDeclaredOnBuilder(checker *shimchecker.Checker, name *shimast.Node) bool {
	symbol := checker.GetSymbolAtLocation(name)
	if symbol == nil {
		return false
	}
	for _, decl := range symbol.Declarations {
		if declaredOnBuilderInterface(decl) {
			return true
		}
	}
	return false
}

// declaredOnBuilderInterface reports whether decl's parent is the
// `ConfigurationBuilder` interface declared inside the
// `declare module '@rhombus-std/config'` block.
func declaredOnBuilderInterface(decl *shimast.Node) bool {
	if decl == nil {
		return false
	}
	parent := decl.Parent
	if parent == nil || parent.Kind != shimast.KindInterfaceDeclaration {
		return false
	}
	ifaceName := parent.Name()
	if ifaceName == nil || ifaceName.Text() != declaringInterface {
		return false
	}
	return interfaceIsInDeclaringModule(parent)
}

// interfaceIsInDeclaringModule reports whether iface's enclosing `declare module`
// names declaringModule. The interface sits inside a `ModuleBlock` whose parent is
// the `ModuleDeclaration`; its name is the string-literal specifier.
func interfaceIsInDeclaringModule(iface *shimast.Node) bool {
	for node := iface.Parent; node != nil; node = node.Parent {
		if node.Kind != shimast.KindModuleDeclaration {
			continue
		}
		moduleName := node.Name()
		if moduleName == nil || moduleName.Kind != shimast.KindStringLiteral {
			return false
		}
		return moduleName.Text() == declaringModule
	}
	return false
}

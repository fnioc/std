package dioptionstransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// addOptionsName is the member name the sugar is spelled with.
const addOptionsName = "addOptions"

// declaringInterfaces are the registration-builder interfaces the sugar (and the
// explicit verbs) declaration-merge onto: `IServiceManifestBase` (which the public
// `ServiceManifest` alias resolves to) and the concrete `ServiceManifestClass`.
// `ServiceManifest` is a type ALIAS and declares no members, so it never anchors a
// declaration here.
var declaringInterfaces = map[string]bool{
	"IServiceManifestBase": true,
	"ServiceManifestClass": true,
}

// declaringModule is the `declare module` specifier the augmentation is declared
// against — the package that owns the registration-builder interfaces.
const declaringModule = "@rhombus-std/di.core"

// isAddOptionsSugarCall reports whether call is a tokenless
// `<manifest>.addOptions<T>()` sugar call: a property-access callee named
// `addOptions`, exactly ONE type argument, ZERO value arguments, and a resolved
// `addOptions` member declared on a di.core registration-builder interface. The
// explicit two-argument verbs (`addOptions(token, tToken)`) carry value arguments
// and are left untouched — they are already the lowered form this sugar produces.
//
// The receiver is matched at the member's DECLARATION SITE, not by the receiver
// type's symbol name: an inherited member keeps its original declaration, so a
// subinterface, a class carrying the repo's empty extends-merge, an
// interface-typed variable, or a generic `<M extends IServiceManifestBase>` all
// resolve back to that same declaration; an unrelated same-named `addOptions`
// resolves to its own declaration and is rejected.
func isAddOptionsSugarCall(checker *shimchecker.Checker, call *shimast.CallExpression) bool {
	callee := call.Expression
	if callee == nil || callee.Kind != shimast.KindPropertyAccessExpression {
		return false
	}
	name := callee.Name()
	if name == nil || name.Text() != addOptionsName {
		return false
	}
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return false
	}
	argCount := 0
	if call.Arguments != nil {
		argCount = len(call.Arguments.Nodes)
	}
	if argCount != 0 {
		return false
	}
	return memberDeclaredOnManifest(checker, name)
}

// memberDeclaredOnManifest reports whether the `addOptions` member referenced at
// name resolves to a symbol with a declaration on a di.core registration-builder
// interface. A merged property symbol carries declarations from every
// contributing merge, so any one matching declaration suffices.
func memberDeclaredOnManifest(checker *shimchecker.Checker, name *shimast.Node) bool {
	symbol := checker.GetSymbolAtLocation(name)
	if symbol == nil {
		return false
	}
	for _, decl := range symbol.Declarations {
		if declaredOnManifestInterface(decl) {
			return true
		}
	}
	return false
}

// declaredOnManifestInterface reports whether decl's parent is a
// `IServiceManifestBase` / `ServiceManifestClass` interface declared inside the
// `declare module '@rhombus-std/di.core'` block.
func declaredOnManifestInterface(decl *shimast.Node) bool {
	if decl == nil {
		return false
	}
	parent := decl.Parent
	if parent == nil || parent.Kind != shimast.KindInterfaceDeclaration {
		return false
	}
	ifaceName := parent.Name()
	if ifaceName == nil || !declaringInterfaces[ifaceName.Text()] {
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

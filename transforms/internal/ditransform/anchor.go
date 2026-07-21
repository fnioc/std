package ditransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// declaringModule is the `declare module` specifier the transformer's authored
// forms are declaration-merged onto.
const declaringModule = "@rhombus-std/di.core"

// The di.core authoring interface each matched member is declared on — its runtime
// overloads AND the transformer's sugar overloads share one interface:
//
//	add / addFactory / addValue → IServiceManifestBase
//	as                          → IAsBuilder
//	resolve                     → IRequiredResolver
//	resolveAsync / tryResolve   → IResolver
//	isService                   → IServiceQuery
//
// `as` anchors on `IAsBuilder` — the scope-slot face of di.core's `AddChain<S,
// Slots>` slot algebra, which replaced the single `AddBuilder` continuation when
// the manifest became immutable. `AddChain` is a type ALIAS (an intersection of
// the per-slot faces) and declares no members, so it never anchors a declaration
// here; the member's declaration site is the face interface that owns it.
var (
	registrationInterfaces = map[string]bool{"IServiceManifestBase": true}
	asInterfaces           = map[string]bool{"IAsBuilder": true}
	resolveInterfaces      = map[string]bool{"IRequiredResolver": true, "IResolver": true}
	isServiceInterfaces    = map[string]bool{"IServiceQuery": true}
)

// memberAnchoredOnDiCore reports whether the member referenced at name resolves to
// a symbol with ≥1 declaration on one of declaringInterfaces inside
// `declare module '@rhombus-std/di.core'`. A merged property symbol carries ALL
// overload declarations, so an explicit-form call anchors through the sugar
// overload's declare-module declaration; an unrelated same-named member resolves
// to its own declaration and is rejected. An `any` receiver yields no symbol.
func memberAnchoredOnDiCore(checker *shimchecker.Checker, name *shimast.Node, declaringInterfaces map[string]bool) bool {
	if name == nil {
		return false
	}
	// A SYNTHETIC name node (no program position) carries no checker symbol — e.g.
	// the callee of a registration the inline stage already substituted and lowered
	// (`services.add("tok", C, [[...]])`, whose `add` is a side-parsed clone). The
	// checker panics on GetSymbolAtLocation for such a node; guard on the position
	// so a synthetic callee is a clean non-match (the call is already fully lowered),
	// mirroring the nameof / resolve stages' own `Pos() < 0` guards.
	//
	// A node can also carry a real position but an unset `Parent` — a property
	// access the inline substitution rebuilt because its OBJECT child changed
	// (`X.as` rebuilt over a synthetic `X`), which keeps the wrapper's own source
	// span but never gets re-linked to its parent. The checker's
	// GetSymbolAtLocation derefs `Parent.Parent` unconditionally, so this needs
	// the same clean-skip guard (see nameoftransform.isNameofCall for the full
	// writeup and the reproducing fixture).
	if name.Pos() < 0 || name.Parent == nil {
		return false
	}
	symbol := checker.GetSymbolAtLocation(name)
	if symbol == nil {
		return false
	}
	for _, decl := range symbol.Declarations {
		if declaredOnAuthoringInterface(decl, declaringInterfaces) {
			return true
		}
	}
	return false
}

// declaredOnAuthoringInterface reports whether decl's parent is an interface named
// in declaringInterfaces inside the `declare module '@rhombus-std/di.core'` block.
func declaredOnAuthoringInterface(decl *shimast.Node, declaringInterfaces map[string]bool) bool {
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

// interfaceIsInDeclaringModule reports whether iface's NEAREST enclosing module
// declaration is `declare module '@rhombus-std/di.core'`. The nearest module scope
// decides: an interface nested in a namespace inside the declaring module belongs
// to that namespace, not the module, so it is rejected.
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

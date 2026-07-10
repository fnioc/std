package dioptionstransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// addOptionsName is the member name the sugar is spelled with.
const addOptionsName = "addOptions"

// manifestNames are the type symbol names a registration builder surfaces: the
// public `ServiceManifest` alias, the `ServiceManifestBase` interface it expands
// to, and the concrete `ServiceManifestClass` a runtime instance produces. The
// receiver of a tokenless `addOptions<T>()` must resolve to one of these.
var manifestNames = map[string]bool{
	"ServiceManifest":      true,
	"ServiceManifestBase":  true,
	"ServiceManifestClass": true,
}

// isAddOptionsSugarCall reports whether call is a tokenless
// `<manifest>.addOptions<T>()` sugar call: a property-access callee named
// `addOptions`, exactly ONE type argument, ZERO value arguments, and a receiver
// whose type resolves through a ServiceManifest. The explicit two-argument verbs
// (`addOptions(token, tToken)`) carry value arguments and are left untouched —
// they are already the lowered form this sugar produces.
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
	return receiverIsManifest(checker, callee.AsPropertyAccessExpression().Expression)
}

// receiverIsManifest reports whether expr's type is (or resolves through) a
// ServiceManifest. A generic instance surfaces its symbol through the apparent
// type, so both the direct and apparent type are checked.
func receiverIsManifest(checker *shimchecker.Checker, expr *shimast.Node) bool {
	t := checker.GetTypeAtLocation(expr)
	if t == nil {
		return false
	}
	if typeNamedManifest(t) {
		return true
	}
	return typeNamedManifest(checker.GetApparentType(t))
}

// typeNamedManifest reports whether a type's name symbol (its alias symbol when
// spelled through an alias, else its underlying symbol) is a ServiceManifest name.
func typeNamedManifest(t *shimchecker.Type) bool {
	if t == nil {
		return false
	}
	symbol := shimchecker.Type_getTypeNameSymbol(t)
	if symbol == nil {
		return false
	}
	return manifestNames[symbol.Name]
}

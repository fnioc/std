package ditransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// checkExtractedRegistration runs the §4.5 factory-signature check for a class
// the transformer extracts a signature from. Best-effort: an unresolvable shape
// is skipped, never flagged.
func (c *context) checkExtractedRegistration(extraction *constructorExtraction) {
	classDecl := classDeclFromSymbol(extraction.classSymbol)
	if classDecl == nil {
		return
	}
	ctor := findConstructor(classDecl)
	if ctor == nil {
		return
	}
	for _, param := range ctorParameters(ctor) {
		c.checkFactoryParam(param)
	}
}

// checkFactoryParam compares an inline-factory param's declared call signature
// against the produced concrete ctor's caller-supplied (hole) params, warning on
// a count mismatch (arity-only).
func (c *context) checkFactoryParam(param *shimast.Node) {
	typeNode := paramTypeNode(param)
	if typeNode == nil || typeNode.Kind != shimast.KindFunctionType {
		return
	}
	sig := c.signatureOfFunctionTypeNode(typeNode)
	if sig == nil {
		return
	}
	returnType := c.checker.GetReturnTypeOfSignature(sig)
	producedClass := c.concreteClassFor(returnType)
	if producedClass == nil {
		return
	}
	producedCtor := findConstructor(producedClass)
	if producedCtor == nil {
		return
	}

	holeCount := 0
	for _, p := range ctorParameters(producedCtor) {
		if c.isCallerSuppliedParam(p) {
			holeCount++
		}
	}
	declared := typeNode.AsFunctionTypeNode().Parameters
	declaredCount := 0
	if declared != nil {
		declaredCount = len(declared.Nodes)
	}
	ctorParamCount := len(ctorParameters(producedCtor))

	if declaredCount < holeCount || declaredCount > ctorParamCount {
		name := ""
		if param.Name() != nil {
			name = param.Name().Text()
		}
		c.emitWarning(typeNode, codeFactorySignatureMismatch,
			"Factory parameter \""+name+"\" declares "+itoa(declaredCount)+" argument(s), but "+
				"the produced constructor has "+itoa(holeCount)+" caller-supplied hole(s) and "+
				itoa(ctorParamCount)+" total slot(s). Declared params must cover all holes "+
				"and may additionally name registered-service overrides (caller wins), "+
				"but cannot exceed the total slot count.")
	}
}

// isCallerSuppliedParam reports whether a produced-ctor param is a §4.5 hole: a
// singular literal, a bare intrinsic keyword, or an anonymous structure with no
// token — a primitive scalar the container does not provide.
func (c *context) isCallerSuppliedParam(param *shimast.Node) bool {
	t := c.checker.GetTypeAtLocation(param)
	if _, ok := tokens.SingletonValue(t); ok {
		return true
	}
	if _, ok := tokens.IntrinsicToken(t); ok {
		return true
	}
	_, ok := c.slotForParam(param)
	return !ok
}

// concreteClassFor resolves a type to its concrete class declaration, unwrapping
// a `Promise<X>` product.
func (c *context) concreteClassFor(t *shimchecker.Type) *shimast.Node {
	if direct := classDeclarationOfType(t); direct != nil {
		return direct
	}
	symbol := t.Symbol()
	if symbol != nil && symbol.Name == "Promise" {
		args := c.checker.GetTypeArguments(t)
		if len(args) == 1 {
			return classDeclarationOfType(args[0])
		}
	}
	return nil
}

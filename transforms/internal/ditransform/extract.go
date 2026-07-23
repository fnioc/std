package ditransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// Extractor exposes ditransform's constructor / factory dependency-signature
// extraction as a standalone primitive for the signatureof stage. It shares the
// di registration stage's EXACT extraction + rendering path — the array literal
// it returns is byte-identical to the third argument the di stage synthesizes
// for the same class / factory value — so the inline `addClass<T>()` / `addFactory<T>()`
// sugar lowering (nameof + signatureof) and the di stage's direct `addClass<I>(C)`
// lowering never diverge. Sharing the code (not duplicating it) is what makes
// that parity structural rather than coincidental.
type Extractor struct {
	c *context
}

// NewExtractor builds a signature Extractor over a loaded program's checker and
// token core, emitting through the given diagnostic sink. The EmitContext
// supplies the node factory the rendered literal is built with — the same
// factory the di stage prints from, so the emitted literal matches byte-for-byte.
func NewExtractor(
	ctx *tokens.Context,
	checker *shimchecker.Checker,
	ec *shimprinter.EmitContext,
	sf *shimast.SourceFile,
	addDiag func(Diagnostic),
) *Extractor {
	return &Extractor{c: &context{
		tokens:  ctx,
		checker: checker,
		factory: ec.Factory.AsNodeFactory(),
		sf:      sf,
		addDiag: addDiag,
		ec:      ec,
	}}
}

// SignatureArray extracts the `[[...]]` dependency-signature array literal a
// class or factory VALUE would lower to, or ok=false for a value that is neither
// constructable nor callable (a caller then leaves the primitive call in place,
// which the emit sweep flags as an unlowered primitive).
func (e *Extractor) SignatureArray(arg *shimast.Node) (*shimast.Node, bool) {
	sigs, ok := e.c.signaturesForValue(arg)
	if !ok {
		return nil, false
	}
	return e.c.signaturesLiteral(sigs), true
}

// SignatureArrayForRegistration is the dep-hole-CHECKED variant of SignatureArray:
// it extracts the same `[[...]]` literal AND runs the di stage's dependency-hole
// check (990010) against the service token the value is registered under. The
// plain SignatureArray deliberately omits that check (a standalone `signatureof(x)`
// has no service token in scope), but when a signatureof call is the third
// argument of a fully-lowered `addClass(token, value, signatureof(value))` registration
// the sibling token IS in scope — the nameof stage runs before signatureof, so
// arg[0] is already a string literal. Parity with the di stage's direct
// `addClass<I>(C)` lowering then requires the SAME 990010 to fire for a dependency that
// references a hole the service token does not bind; without this the inline
// (inline + signatureof) path would silently emit `??unresolvable??` where the
// direct path errors. The emitted literal is byte-identical to SignatureArray for
// VALID inputs — checkDepHoles only reports, it never rewrites — so only invalid
// inputs gain the diagnostic.
func (e *Extractor) SignatureArrayForRegistration(arg *shimast.Node, token string, hasToken bool) (*shimast.Node, bool) {
	sigs, ok := e.c.signaturesForValue(arg)
	if !ok {
		return nil, false
	}
	e.c.checkDepHoles(sigs, token, hasToken, classifyServiceToken(token, hasToken), arg)
	return e.c.signaturesLiteral(sigs), true
}

// signaturesForValue extracts the dependency signatures a class / factory value
// carries — the value-inspection half of planAddRegistration, shared with the
// signatureof primitive. Token derivation, registration-time override merging,
// and dependency-hole checking are the di stage's concern (they belong to the
// service token, not the value's own signature) and are deliberately excluded,
// so this reproduces exactly the signatures the di stage renders for a bare
// `addClass<I>(C)` / `addFactory<I>(fn)` — the two forms Wave-1 authors as inline
// bodies. The branch order mirrors planAddRegistration's value branches.
func (c *context) signaturesForValue(arg *shimast.Node) ([]signature, bool) {
	if isFactoryArg(arg) {
		return c.extractSignatureFromFunction(arg), true
	}
	if arg.Kind == shimast.KindExpressionWithTypeArguments {
		if sigs, ok := c.extractInstantiatedSignature(arg); ok {
			return sigs, true
		}
	}
	t := c.checker.GetTypeAtLocation(arg)
	if len(c.constructSignatures(t)) != 0 {
		if extraction, ok := c.extractFromExpression(arg); ok {
			return c.classSignatureFromExtraction(extraction), true
		}
		return c.extractCtorReferenceSignature(arg)
	}
	if len(c.callSignatures(t)) != 0 {
		return c.extractFactoryReferenceSignature(arg)
	}
	return nil, false
}

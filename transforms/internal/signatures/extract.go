package signatures

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// Extractor is the constructor / factory dependency-signature extraction engine
// the signatureof stage drives. The `[[...]]` array literal it returns is exactly
// the third argument a hand-written `addClass("token", ctor, [[...]])` registration
// carries, so the inline `addClass<T>()` / `addFactory<T>()` sugar lowering (nameof +
// signatureof) emits what a no-transformer author would write by hand. This was
// the shared extraction path the deleted di registration stage also used; it now
// lives here as the sole owner.
type Extractor struct {
	c *context
}

// NewExtractor builds a signature Extractor over a loaded program's checker and
// token core, emitting through the given diagnostic sink. The EmitContext
// supplies the node factory the rendered literal is built with.
func NewExtractor(
	ctx *tokens.Context,
	checker *shimchecker.Checker,
	ec *shimprinter.EmitContext,
	sf *shimast.SourceFile,
	addDiag func(Diagnostic),
) *Extractor {
	return &Extractor{c: &context{
		tokens:      ctx,
		checker:     checker,
		factory:     ec.Factory.AsNodeFactory(),
		sf:          sf,
		addDiag:     addDiag,
		ec:          ec,
		parseAnchor: plugin.NewCheckerAnchor(ec, sf),
	}}
}

// SignatureArray extracts the `[[...]]` dependency-signature array literal a
// class or factory VALUE would lower to, or ok=false for a value that is neither
// constructable nor callable (a caller then leaves the primitive call in place,
// which the emit sweep flags as an unlowered primitive).
//
// CALLER CONTRACT: arg must be a PARSE node. Both callers satisfy it — the
// signatureof stage reads its source-written argument off the parse-anchored call,
// and the inline stage anchored the argument it recorded in its artifacts — which
// is what keeps the type queries below off a tree the loop has rewritten
// (plugin.CheckerAnchor). signaturesForValue re-applies the anchor on entry, ahead
// of its first checker query, so a future caller that forgets gets a clean miss
// rather than a crash.
func (e *Extractor) SignatureArray(arg *shimast.Node) (*shimast.Node, bool) {
	sigs, ok := e.c.signaturesForValue(arg)
	if !ok {
		return nil, false
	}
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
//
// The anchor is applied HERE, not deeper: every branch below is a checker query
// (GetTypeAtLocation on a call expression is the very one that resolves overloads
// and walks into a minted literal), so the ONE place that makes the extractor safe
// for a caller who hands it a rewritten node is ahead of the first of them. No
// anchor in this file means a minted or foreign-file node — a clean "not a
// constructable or callable value" miss, which the caller leaves in place for the
// emit sweep to report.
func (c *context) signaturesForValue(arg *shimast.Node) ([]signature, bool) {
	arg = c.parseAnchor(arg)
	if arg == nil {
		return nil, false
	}
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

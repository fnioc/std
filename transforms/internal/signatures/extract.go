package signatures

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

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

// SignatureForTuple mints ONE overload's slots from an EXPLICIT dependency tuple
// type `T` — the type-argument `signaturefor<T>()` primitive, the minting twin of
// the value-observing `SignatureArray`. Each tuple ELEMENT becomes a slot through
// the same per-element classifier a rest-param tuple already uses, so the emitted
// array is byte-identical to what a hand author writes for the same slots. It
// renders a SINGLE-level `[slot, ...]` (the `readonly DepSlot[]` a `withSignature`
// append takes), not the two-level signatures array. ok=false when `T` is not a
// tuple — a misuse a caller leaves in place for the emit sweep to flag.
func (e *Extractor) SignatureForTuple(t *shimchecker.Type, anchor *shimast.Node) (*shimast.Node, bool) {
	slots, ok := e.c.tupleElementSlots(t, anchor)
	if !ok {
		return nil, false
	}
	return e.c.slotArrayLiteral(slots), true
}

// SignaturesForTuple mints the WHOLE overload set from a tuple-OF-tuples type `T`
// — the type-argument `signaturesfor<T>()` primitive. Each OUTER element is itself
// a dependency tuple lowered through SignatureForTuple's per-element path, so the
// emitted two-level `[[...], ...]` array is byte-identical to the `withSignatures`
// bulk form a hand author writes. ok=false when `T` or any outer element is not a
// tuple.
func (e *Extractor) SignaturesForTuple(t *shimchecker.Type, anchor *shimast.Node) (*shimast.Node, bool) {
	if !shimchecker.IsTupleType(t) {
		return nil, false
	}
	outer := e.c.checker.GetTypeArguments(t)
	sigs := make([]signature, 0, len(outer))
	for _, elem := range outer {
		slots, ok := e.c.tupleElementSlots(elem, anchor)
		if !ok {
			return nil, false
		}
		sigs = append(sigs, slots)
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

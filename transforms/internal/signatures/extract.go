package signatures

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typeemit"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// Extractor is the constructor / factory dependency-type extraction engine the
// signatureof stage drives. The `Type.ctor(...)` / `Type.func(...)` node it
// returns is exactly the third argument a hand-written `addClass("token",
// ctor, Type.ctor(...))` registration carries, so the inline `addClass<T>()`
// / `addFactory<T>()` sugar lowering (nameof + signatureof) emits what a
// no-transformer author would write by hand.
type Extractor struct {
	c *context
}

// NewExtractor builds a signature Extractor over a loaded program's checker and
// token core, emitting through the given diagnostic sink. binding is the
// `Type` import the emitted node references, materialized by the caller once
// the transform pass has finished (mirroring typefortransform's own binding
// lifecycle).
func NewExtractor(
	ctx *tokens.Context,
	checker *shimchecker.Checker,
	ec *shimprinter.EmitContext,
	sf *shimast.SourceFile,
	binding *valueimport.Binding,
	addDiag func(Diagnostic),
) *Extractor {
	return &Extractor{c: &context{
		tokens:      ctx,
		checker:     checker,
		factory:     ec.Factory.AsNodeFactory(),
		sf:          sf,
		binding:     binding,
		addDiag:     addDiag,
		parseAnchor: plugin.NewCheckerAnchor(ec, sf),
	}}
}

// TypeNode extracts the `Type.ctor(...)` / `Type.func(...)` node a class or
// factory VALUE derives, or ok=false for a value that is neither constructable
// nor callable (a caller then leaves the primitive call in place, which the
// emit sweep flags as an unlowered primitive).
//
// CALLER CONTRACT: arg must be a PARSE node. Both callers satisfy it — the
// signatureof stage reads its source-written argument off the parse-anchored
// call, and the inline stage anchored the argument it recorded in its
// artifacts — which is what keeps the checker queries below off a tree the
// loop has rewritten (plugin.CheckerAnchor). typeNodeForValue re-applies the
// anchor on entry, ahead of its first checker query, so a future caller that
// forgets gets a clean miss rather than a crash.
func (e *Extractor) TypeNode(arg *shimast.Node) (*shimast.Node, bool) {
	return e.c.typeNodeForValue(arg)
}

// typeNodeForValue derives the Ctor/Func node a class / factory value carries —
// the value-inspection half of a registration, shared with the signatureof
// primitive. It reuses typefor's own type-classification narrowing
// (tokens.DeriveTyped / typeemit.EmitDerived) over the value's own type, so a
// signatureof(Foo) target derives identically to a typefor(Foo) one.
//
// The construct/call-signature check ahead of the derivation call is the same
// gate signatureof's value argument has always had: a value with neither shape
// is not a registration target at all, so it is left alone SILENTLY for the
// emit sweep to report — only a value that IS constructable or callable, but
// whose instance/return type or a parameter type has no derivable shape, is
// this extractor's OWN diagnostic to raise.
func (c *context) typeNodeForValue(arg *shimast.Node) (*shimast.Node, bool) {
	arg = c.parseAnchor(arg)
	if arg == nil {
		return nil, false
	}
	t := c.checker.GetTypeAtLocation(arg)
	ctorSigs := shimchecker.Checker_getSignaturesOfType(c.checker, t, shimchecker.SignatureKindConstruct)
	callSigs := shimchecker.Checker_getSignaturesOfType(c.checker, t, shimchecker.SignatureKindCall)
	if len(ctorSigs) == 0 && len(callSigs) == 0 {
		return nil, false
	}
	var failure tokens.Failure
	d, ok := tokens.DeriveTyped(c.tokens, c.checker, t, &failure)
	if !ok {
		c.reportUnderivable(arg, &failure)
		return nil, false
	}
	if d.Kind != tokens.DerivedCtor && d.Kind != tokens.DerivedFunc {
		return nil, false
	}
	return typeemit.EmitDerived(c.factory, c.binding, d), true
}

// reportUnderivable raises the targeted diagnostic for a value that IS
// constructable/callable but whose derivation could not name every
// dependency's type.
func (c *context) reportUnderivable(node *shimast.Node, failure *tokens.Failure) {
	if failure.UnboundTypeParameter != nil {
		c.emitError(node, codeUnboundTypeParameter,
			"this parameter references an unbound type parameter — register the class "+
				"via an instantiation expression that binds it (`Foo<Concrete>`)")
		return
	}
	c.emitError(node, codeUnderivableToken,
		"cannot derive a Type for this dependency — name the type (an anonymous / structural type has no stable shape)")
}

// Package signaturetransform is the Go port of the signatureof primitive: it
// lowers each `signatureof(ctor)` / `signatureof(factory)` call to the derived
// dependency-signature array literal (`[[...]]`) over the ttsc-shipped
// typescript-go checker, reusing ditransform's exact extraction path so the
// emitted literal is byte-identical to the third argument the di registration
// stage synthesizes for the same value. It is a VALUE-argument primitive (unlike
// the type-argument nameof): `signatureof(ctor)` binds a constructor / factory
// expression, and its extracted signature is what a hand-written `add("token",
// ctor, [[...]])` would carry.
//
// The single owner host (cmd/ttsc-std) composes it as the `rhombusstd_signatureof`
// stage, in canonical order AFTER nameof and BEFORE the di stage: it lowers the
// synthetic third argument the inline `add<T>()` sugar body emits, leaving the di
// stage a 3-argument `add(...)` it ignores. A source-written `signatureof(x)`
// (the no-inline manual path) is anchored by symbol, mirroring nameof's two
// branches.
package signaturetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// signatureofName is the exported identifier the primitive is recognized as —
// matched on the resolved symbol so an aliased import still lowers, and the name
// the inline stage records in its artifacts for a substituted call.
const signatureofName = "signatureof"

// New builds the per-file transform. It visits every call expression and
// replaces each `signatureof(value)` with the `[[...]]` dependency-signature
// array literal ditransform derives from that value, then elides the now-unused
// `signatureof` import.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did
// not run). A substituted `signatureof` call carries no checker symbol (its
// callee is a side-parsed clone), so it is anchored via the recorded value
// argument the inline stage captured at the original call site; a source-written
// call is anchored by resolving its callee to the `signatureof` symbol.
func New(prog *driver.Program, ctx *tokens.Context, artifacts *inlinetransform.Artifacts, emit func(ditransform.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		extractor := ditransform.NewExtractor(ctx, checker, ec, sf, emit)
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if arg, ok := signatureofArg(checker, artifacts, node); ok {
					if lit, ok := extractor.SignatureArray(arg); ok {
						return lit
					}
				}
			}
			return visitor.VisitEachChild(node)
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideSignatureofImports(ec.Factory.AsNodeFactory(), output.AsSourceFile())
	}
}

// signatureofArg returns the value argument of a signatureof call at node — from
// the inline artifacts for a substituted (synthetic-callee) call, else by
// resolving a source-written `signatureof(x)` callee to the primitive symbol.
func signatureofArg(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node) (*shimast.Node, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok && use.Name == signatureofName && use.ValueArg != nil {
			return use.ValueArg, true
		}
	}
	return sourceWrittenArg(checker, node)
}

// sourceWrittenArg returns the single value argument of a source-written
// `signatureof(x)` — a one-argument call whose callee resolves (following an
// import alias) to the `signatureof` symbol. It anchors on the checker, which
// panics on a SYNTHETIC callee (no program position — e.g. the inline stage's
// substituted clone); such nodes are handled via artifacts above, so a negative
// position is a clean skip, not a nil-deref inside GetSymbolAtLocation.
func sourceWrittenArg(checker *shimchecker.Checker, node *shimast.Node) (*shimast.Node, bool) {
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return nil, false
	}
	callee := call.Expression
	if callee.Pos() < 0 {
		return nil, false
	}
	symbol := checker.GetSymbolAtLocation(callee)
	if symbol == nil {
		return nil, false
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	if symbol.Name != signatureofName {
		return nil, false
	}
	return call.Arguments.Nodes[0], true
}

// Package signaturetransform is the Go port of the signatureof primitive: it
// lowers each `signatureof(ctor)` / `signatureof(factory)` call to the derived
// `Type.ctor(...)` / `Type.func(...)` node over the ttsc-shipped typescript-go
// checker, reusing the shared signatures extraction engine. It is a
// VALUE-argument primitive (unlike the type-argument nameof): `signatureof(ctor)`
// binds a constructor / factory expression, and its extracted node is what a
// hand-written `addClass("token", ctor, Type.ctor(...))` would carry.
//
// The single owner host (cmd/ttsc-std) composes it as the `rhombusstd_signatureof`
// stage, in canonical order AFTER nameof: it lowers the synthetic third argument
// the inline `addClass<T>()` sugar body emits, so what remains is a 3-argument
// `addClass(...)` byte-identical to the no-transformer hand form. A source-written
// `signatureof(x)` (the no-inline manual path) is anchored by symbol, mirroring
// nameof's two branches.
package signaturetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typeemit"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// signatureofName is the exported identifier the primitive is recognized as —
// matched on the resolved symbol so an aliased import still lowers, and the name
// the inline stage records in its artifacts for a substituted call.
const signatureofName = "signatureof"

// New builds the per-file transform. It visits every call expression and
// replaces each `signatureof(value)` with the `Type.ctor(...)` / `Type.func(...)`
// node the signatures engine derives from that value, then elides the
// now-unused `signatureof` import and materializes a `Type` import for any
// node it emitted.
//
// artifacts is the inline stage's per-run state (nil when the inline stage did
// not run). A substituted `signatureof` call carries no checker symbol (its
// callee is a side-parsed clone), so it is anchored via the recorded value
// argument the inline stage captured at the original call site; a source-written
// call is anchored by resolving its callee to the `signatureof` symbol.
func New(prog *driver.Program, ctx *tokens.Context, artifacts *inlinetransform.Artifacts, emit func(signatures.Diagnostic)) plugin.FileTransform {
	checker := prog.Checker
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		factory := ec.Factory.AsNodeFactory()
		binding := valueimport.Resolve(sf, typeemit.Ref)
		// Which primitive a callee is, and what a registration's value argument is,
		// are facts about SOURCE-WRITTEN syntax; they are resolved against the parse
		// node so no checker query ever walks the tree this loop has rewritten (see
		// plugin.CheckerAnchor — a rewritten registration holds the minted union slot
		// that nil-derefs the checker).
		parseAnchor := plugin.NewCheckerAnchor(ec, sf)
		extractor := signatures.NewExtractor(ctx, checker, ec, sf, binding, emit)
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if arg, ok := signatureofArg(checker, parseAnchor, artifacts, node); ok {
					if typeNode, ok := extractor.TypeNode(arg); ok {
						return typeNode
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
		result := elideSignatureofImports(factory, output.AsSourceFile())
		return valueimport.Ensure(factory, result, binding)
	}
}

// signatureofArg returns the value argument of a signatureof call at node — from
// the inline artifacts for a substituted (synthetic-callee) call, else by
// resolving a source-written `signatureof(x)` callee to the primitive symbol.
func signatureofArg(
	checker *shimchecker.Checker,
	parseAnchor plugin.CheckerAnchor,
	artifacts *inlinetransform.Artifacts,
	node *shimast.Node,
) (*shimast.Node, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok && use.Name == signatureofName && use.ValueArg != nil {
			return use.ValueArg, true
		}
	}
	return sourceWrittenArg(checker, parseAnchor, node)
}

// sourceWrittenArg returns the single value argument of a source-written
// `signatureof(x)` — a one-argument call whose callee resolves (following an
// import alias) to the `signatureof` symbol.
//
// Both the callee AND the returned argument come off the PARSE node. The callee is
// a checker input (GetSymbolAtLocation) and so is the argument — the extractor
// resolves its own type and derives a `Type.ctor(...)` / `Type.func(...)` node
// from it — so neither may come from the tree the loop has rewritten.
// This stage was the SECOND crash site: with only nameof anchored, a trailing chain
// call over a registration holding this stage's own minted union slot still walked
// the checker into that literal (plugin.CheckerAnchor has the mechanism). A call
// with no anchor is minted or is a substituted body clone; the substituted form is
// handled via artifacts above, so it is a clean skip here.
func sourceWrittenArg(
	checker *shimchecker.Checker,
	parseAnchor plugin.CheckerAnchor,
	node *shimast.Node,
) (*shimast.Node, bool) {
	call := parseAnchor.AnchoredCall(node)
	if call == nil {
		return nil, false
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return nil, false
	}
	symbol := checker.GetSymbolAtLocation(call.Expression)
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

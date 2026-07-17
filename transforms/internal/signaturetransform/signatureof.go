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
		// tokenForCall records the service token of the enclosing registration for a
		// signatureof call that is a lowered `add(token, value, signatureof(value))`
		// third argument. It is populated TOP-DOWN when the enclosing call is visited
		// (arg[0] already lowered to a string literal by the nameof stage), then read
		// when the visitor descends to that signatureof call so it lowers through the
		// dep-hole-checked extractor variant — 990010 parity with the di stage's
		// direct add<I>(C) lowering. A standalone signatureof (no enclosing
		// registration) is absent from this map and keeps its unchecked lowering.
		tokenForCall := map[*shimast.Node]string{}
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if node.Kind == shimast.KindCallExpression {
				if sigCall, token, ok := registrationSignatureofCall(node); ok {
					tokenForCall[sigCall] = token
				}
				if arg, ok := signatureofArg(checker, artifacts, node); ok {
					if token, checked := tokenForCall[node]; checked {
						if lit, ok := extractor.SignatureArrayForRegistration(arg, token, true); ok {
							return lit
						}
					} else if lit, ok := extractor.SignatureArray(arg); ok {
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

// registrationSignatureofCall recognizes a fully-lowered registration call
// `receiver.add("token", value, signatureof(value))` (or `.addFactory`) — after
// the nameof stage lowered arg[0] to a string literal — and returns the
// signatureof call node (the last argument) plus the service-token string. The
// signatureof stage stashes this so, when its visitor descends to that call, the
// argument lowers through the dep-hole-checked extractor variant (990010 parity
// with the di stage's direct add<I>(C) lowering) rather than the tokenless
// SignatureArray. Matching is purely structural (kind, member name, string-literal
// arg[0]) — it never touches the checker, so a synthetic (inline-substituted)
// call is handled without a position/symbol lookup. The last-arg check that it is
// actually a signatureof call is left to the per-node signatureofArg gate: a
// non-signatureof last arg simply leaves the stashed token unused.
func registrationSignatureofCall(node *shimast.Node) (*shimast.Node, string, bool) {
	call := node.AsCallExpression()
	if call.Arguments == nil {
		return nil, "", false
	}
	args := call.Arguments.Nodes
	if len(args) < 3 {
		return nil, "", false
	}
	callee := call.Expression
	if callee.Kind != shimast.KindPropertyAccessExpression {
		return nil, "", false
	}
	method := callee.Name().Text()
	if method != "add" && method != "addFactory" {
		return nil, "", false
	}
	if args[0].Kind != shimast.KindStringLiteral {
		return nil, "", false
	}
	last := args[len(args)-1]
	if last.Kind != shimast.KindCallExpression {
		return nil, "", false
	}
	return last, args[0].Text(), true
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

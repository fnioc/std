// Package signaturetransform is the Go port of the signatureof primitive: it
// lowers each `signatureof(ctor)` / `signatureof(factory)` call to the derived
// dependency-signature array literal (`[[...]]`) over the ttsc-shipped
// typescript-go checker, reusing the shared signatures extraction engine so the
// emitted literal is byte-identical to the third argument the di registration
// stage synthesizes for the same value. It is a VALUE-argument primitive (unlike
// the type-argument nameof): `signatureof(ctor)` binds a constructor / factory
// expression, and its extracted signature is what a hand-written `addClass("token",
// ctor, [[...]])` would carry.
//
// The single owner host (cmd/ttsc-std) composes it as the `rhombusstd_signatureof`
// stage, in canonical order AFTER nameof and BEFORE the di stage: it lowers the
// synthetic third argument the inline `addClass<T>()` sugar body emits, leaving the di
// stage a 3-argument `addClass(...)` it ignores. A source-written `signatureof(x)`
// (the no-inline manual path) is anchored by symbol, mirroring nameof's two
// branches.
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
)

// signatureofName is the exported identifier the primitive is recognized as —
// matched on the resolved symbol so an aliased import still lowers, and the name
// the inline stage records in its artifacts for a substituted call.
const signatureofName = "signatureof"

// New builds the per-file transform. It visits every call expression and
// replaces each `signatureof(value)` with the `[[...]]` dependency-signature
// array literal the signatures engine derives from that value, then elides the now-unused
// `signatureof` import.
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
		extractor := signatures.NewExtractor(ctx, checker, ec, sf, emit)
		// minted records the slot-array literals this stage produced from a
		// signaturefor / signaturesfor lowering, so a spread of one inside a
		// `withSignature` / `withSignatures` call is flattened positionally (and only
		// those — an unrelated user spread over an array literal is left alone).
		minted := map[*shimast.Node]bool{}
		// tokenForCall records the service token of the enclosing registration for a
		// signatureof call that is a lowered `addClass(token, value, signatureof(value))`
		// third argument. It is populated TOP-DOWN when the enclosing call is visited
		// (arg[0] already lowered to a string literal by the nameof stage), then read
		// when the visitor descends to that signatureof call so it lowers through the
		// dep-hole-checked extractor variant — 990010 parity with the di stage's
		// direct addClass<I>(C) lowering. A standalone signatureof (no enclosing
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
				// The type-argument minting siblings: lower a signaturefor / signaturesfor
				// call to its slot-array literal and record it, so the enclosing
				// `withSignature(...)` / `withSignatures(...)` call flattens its spread below.
				if lit, ok := lowerSignatureFor(extractor, checker, artifacts, node); ok {
					minted[lit] = true
					return lit
				}
			}
			visited := visitor.VisitEachChild(node)
			if visited != nil && visited.Kind == shimast.KindCallExpression {
				return flattenSignatureForSpreads(factory, visited, minted)
			}
			return visited
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return elideSignatureofImports(ec.Factory.AsNodeFactory(), output.AsSourceFile())
	}
}

// signaturesArgIndex is the positional slot the dependency-signature argument
// occupies in a lowered registration call. di.core's verbs order their arguments
// `(token, value, signatures, scope, key)`, so signatures is ALWAYS argument 3 —
// it is required, never elided, and the optional scope / key slots follow it.
// Reading this slot by index is what makes the match survive a keyed registration
// (`addClass("base", C, [[...]], void 0, "redis")`), where the signatureof call is
// no longer the last argument.
const signaturesArgIndex = 2

// registrationSignatureofCall recognizes a fully-lowered registration call
// `receiver.addClass("token", value, signatureof(value)[, scope[, key]])` (or
// `.addFactory`) — after the nameof stage lowered arg[0] to a string literal —
// and returns the signatureof call node (the signatures argument) plus the
// service-token string. The signatureof stage stashes this so, when its visitor
// descends to that call, the argument lowers through the dep-hole-checked
// extractor variant (990010 parity with the di stage's direct addClass<I>(C) lowering)
// rather than the tokenless SignatureArray. Matching is purely structural (kind,
// member name, string-literal arg[0]) — it never touches the checker, so a
// synthetic (inline-substituted) call is handled without a position/symbol
// lookup. The check that the slot holds an actual signatureof call is left to the
// per-node signatureofArg gate: a non-signatureof argument there simply leaves
// the stashed token unused.
func registrationSignatureofCall(node *shimast.Node) (*shimast.Node, string, bool) {
	call := node.AsCallExpression()
	if call.Arguments == nil {
		return nil, "", false
	}
	args := call.Arguments.Nodes
	if len(args) <= signaturesArgIndex {
		return nil, "", false
	}
	callee := call.Expression
	if callee.Kind != shimast.KindPropertyAccessExpression {
		return nil, "", false
	}
	method := callee.Name().Text()
	if method != "addClass" && method != "addFactory" {
		return nil, "", false
	}
	if args[0].Kind != shimast.KindStringLiteral {
		return nil, "", false
	}
	signatures := args[signaturesArgIndex]
	if signatures.Kind != shimast.KindCallExpression {
		return nil, "", false
	}
	return signatures, args[0].Text(), true
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
//
// A node can also carry a real position but an unset `Parent` — a property
// access the inline substitution rebuilt because its OBJECT child changed
// (mirroring nameoftransform.isNameofCall's `.as`-chain hazard: this stage's
// visitor, like nameof's, walks every call expression in the file
// unconditionally, so it reaches the SAME kind of node). The checker's
// GetSymbolAtLocation derefs `Parent.Parent` unconditionally, so this needs the
// same clean-skip guard.
func sourceWrittenArg(checker *shimchecker.Checker, node *shimast.Node) (*shimast.Node, bool) {
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return nil, false
	}
	callee := call.Expression
	if callee.Pos() < 0 || callee.Parent == nil {
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

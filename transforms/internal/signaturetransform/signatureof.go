// Package signaturetransform is the Go port of the signatureof primitive: it
// lowers each `signatureof(ctor)` / `signatureof(factory)` call to the derived
// dependency-signature array literal (`[[...]]`) over the ttsc-shipped
// typescript-go checker, reusing the shared signatures extraction engine. It is a
// VALUE-argument primitive (unlike the type-argument nameof): `signatureof(ctor)`
// binds a constructor / factory expression, and its extracted signature is what a
// hand-written `addClass("token", ctor, [[...]])` would carry.
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

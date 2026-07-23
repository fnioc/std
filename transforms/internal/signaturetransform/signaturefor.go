package signaturetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
)

// The TYPE-argument minting siblings of the value-argument `signatureof`:
// `signaturefor<T>()` mints ONE overload's slots from the dependency tuple `T`,
// `signaturesfor<T>()` mints the whole overload set from a tuple-of-tuples. They
// share signatureof's ditransform.Extractor over the EXPLICIT type argument, so
// the emitted array is byte-identical to what the di stage / a hand author writes
// for the same slots. Both lower in THIS stage (after nameof, before di) beside
// signatureof; the sugar bodies spread them into a `withSignature` /
// `withSignatures` call (`this.withSignature(...signaturefor<T>())`), which this
// stage flattens so the emitted append carries the minted slots positionally.
const (
	signatureforName  = "signaturefor"
	signaturesforName = "signaturesfor"
)

// lowerSignatureFor lowers a `signaturefor<T>()` / `signaturesfor<T>()` call to its
// slot-array literal — a SINGLE-level `[slot, ...]` for signaturefor, a two-level
// `[[...], ...]` for signaturesfor. It recognizes both an inline-substituted call
// (its bound tuple type read from the inline artifacts, since the synthetic callee
// carries no symbol) and a source-written one (anchored by resolving the callee to
// the primitive symbol). ok=false leaves the call in place for the emit sweep.
func lowerSignatureFor(extractor *ditransform.Extractor, checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node) (*shimast.Node, bool) {
	t, name, ok := signatureForCall(checker, artifacts, node)
	if !ok || t == nil {
		return nil, false
	}
	if name == signatureforName {
		return extractor.SignatureForTuple(t, node)
	}
	return extractor.SignaturesForTuple(t, node)
}

// signatureForCall returns the bound tuple type argument of a
// signaturefor / signaturesfor call plus which primitive it is — from the inline
// artifacts for a substituted (synthetic-callee) call, else by resolving a
// source-written call's callee and reading its type argument through the checker.
func signatureForCall(checker *shimchecker.Checker, artifacts *inlinetransform.Artifacts, node *shimast.Node) (*shimchecker.Type, string, bool) {
	if artifacts != nil {
		if use, ok := artifacts.PrimitiveCalls[node]; ok &&
			(use.Name == signatureforName || use.Name == signaturesforName) && len(use.TypeArgs) != 0 {
			return use.TypeArgs[0], use.Name, true
		}
	}
	return sourceWrittenSignatureFor(checker, node)
}

// sourceWrittenSignatureFor resolves a source-written `signaturefor<T>()` /
// `signaturesfor<T>()` — a single-type-argument call whose callee resolves
// (following an import alias) to one of the two primitive symbols — and returns
// the checker type of its type argument. It guards the callee's position / parent
// exactly as signatureof and nameof do: the checker's GetSymbolAtLocation panics on
// a synthetic callee (no program position) or an inline-rebuilt property access
// (an unset Parent), so both are a clean skip — a substituted call is handled via
// artifacts above.
func sourceWrittenSignatureFor(checker *shimchecker.Checker, node *shimast.Node) (*shimchecker.Type, string, bool) {
	call := node.AsCallExpression()
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return nil, "", false
	}
	callee := call.Expression
	if callee.Pos() < 0 || callee.Parent == nil {
		return nil, "", false
	}
	symbol := checker.GetSymbolAtLocation(callee)
	if symbol == nil {
		return nil, "", false
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	if symbol.Name != signatureforName && symbol.Name != signaturesforName {
		return nil, "", false
	}
	t := checker.GetTypeFromTypeNode(call.TypeArguments.Nodes[0])
	return t, symbol.Name, true
}

// flattenSignatureForSpreads rewrites a call whose argument list contains a
// SpreadElement over a slot-array literal THIS stage just minted (from a
// signaturefor / signaturesfor lowering) into a call carrying that array's
// elements positionally — `this.withSignature(...[a, b])` → `this.withSignature(a,
// b)`. Only minted array literals are flattened, so an unrelated user spread over
// an array literal is left verbatim. The rebuild preserves the callee and any
// original type arguments.
func flattenSignatureForSpreads(factory *shimast.NodeFactory, call *shimast.Node, minted map[*shimast.Node]bool) *shimast.Node {
	expr := call.AsCallExpression()
	if expr.Arguments == nil {
		return call
	}
	args := expr.Arguments.Nodes
	changed := false
	out := make([]*shimast.Node, 0, len(args))
	for _, arg := range args {
		if arg.Kind == shimast.KindSpreadElement {
			inner := arg.AsSpreadElement().Expression
			if minted[inner] && inner.Kind == shimast.KindArrayLiteralExpression {
				out = append(out, inner.AsArrayLiteralExpression().Elements.Nodes...)
				changed = true
				continue
			}
		}
		out = append(out, arg)
	}
	if !changed {
		return call
	}
	return factory.NewCallExpression(expr.Expression, nil, expr.TypeArguments, factory.NewNodeList(out), 0)
}

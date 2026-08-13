package typefortransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// derivedKind discriminates a derived node — the four `Type` shapes typefor
// itself interprets a checker type as, layered over tokens.DeriveTypeF's own
// named / literal / union / placeholder tree (kept, unclassified, as a leaf).
type derivedKind int

const (
	derivedLeaf derivedKind = iota
	derivedFunc
	derivedCtor
	derivedTag
)

// derived is typefor's own structural node. A leaf wraps a tokens.TypeNode
// unchanged (tokens.DeriveTypeF never classifies a function, a constructor, or a
// Keyed brand — only typefor does, which is why this tree lives here and not in
// the tokens package). Func's Return is the call signature's return type; Ctor's
// Return is the construct signature's instance type; both share Args, the
// signature's parameter types. Tag's Inner is the Keyed brand's stripped base.
type derived struct {
	kind derivedKind
	leaf *tokens.TypeNode

	ret  *derived
	args []*derived

	tag   string
	inner *derived
}

// deriveTyped classifies a checker type into typefor's own tree: a `Keyed<T, K>`
// brand first (so a keyed factory or class still classifies its stripped base as
// Func/Ctor beneath the tag), then a construct signature (CtorType — checked
// before call, matching TypeFor<T>'s own conditional order), then a call
// signature (FuncType), and otherwise the plain tokens.DeriveTypeF leaf. Each
// recursion point — a signature's return/instance type, its parameters, a tag's
// inner type — reclassifies from scratch, so a factory that itself returns a
// factory nests `Type.func(Type.func(...))` the way a hand-writer would spell it.
func deriveTyped(ctx *tokens.Context, checker *shimchecker.Checker, t *shimchecker.Type, failure *tokens.Failure) (*derived, bool) {
	if t == nil {
		return nil, false
	}
	if key, ok := tokens.KeyLiteralFor(t, checker); ok {
		base := tokens.KeyedBaseType(t, checker)
		inner, ok := deriveTyped(ctx, checker, base, failure)
		if !ok {
			return nil, false
		}
		return &derived{kind: derivedTag, tag: key, inner: inner}, true
	}
	if ctorSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindConstruct); len(ctorSigs) != 0 {
		return deriveSignatureShaped(ctx, checker, ctorSigs[0], failure, derivedCtor)
	}
	if callSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall); len(callSigs) != 0 {
		return deriveSignatureShaped(ctx, checker, callSigs[0], failure, derivedFunc)
	}
	node, ok := tokens.DeriveTypeF(ctx, t, failure)
	if !ok {
		return nil, false
	}
	return &derived{kind: derivedLeaf, leaf: node}, true
}

// deriveSignatureShaped derives a Func/Ctor node from one signature: its return
// type (the function's product, or the constructor's instance) and its
// parameter types, each independently reclassified via deriveTyped.
func deriveSignatureShaped(
	ctx *tokens.Context,
	checker *shimchecker.Checker,
	sig *shimchecker.Signature,
	failure *tokens.Failure,
	kind derivedKind,
) (*derived, bool) {
	ret, ok := deriveTyped(ctx, checker, checker.GetReturnTypeOfSignature(sig), failure)
	if !ok {
		return nil, false
	}
	params := shimchecker.Signature_parameters(sig)
	args := make([]*derived, 0, len(params))
	for _, param := range params {
		paramType := checker.GetTypeOfSymbol(param)
		if paramType == nil {
			return nil, false
		}
		argNode, ok := deriveTyped(ctx, checker, paramType, failure)
		if !ok {
			return nil, false
		}
		args = append(args, argNode)
	}
	return &derived{kind: kind, ret: ret, args: args}, true
}

// kindName is the TypeBase<Kind> discriminant string typefor's `.kind` accessor
// reads off a derived node — the same literal the runtime `Type.*` factory the
// node emits as would stamp on its `kind` field.
func kindName(d *derived) string {
	switch d.kind {
	case derivedFunc:
		return "func"
	case derivedCtor:
		return "ctor"
	case derivedTag:
		return "tag"
	case derivedLeaf:
		switch d.leaf.Kind {
		case tokens.TypeNodeLiteral:
			return "literal"
		case tokens.TypeNodeUnion:
			return "union"
		case tokens.TypeNodePlaceholder:
			return "generic"
		default:
			return "named"
		}
	default:
		return ""
	}
}

// emitAccessor projects a TypeBase member name onto a derived node, returning the
// AST expression the property access folds to and applies=true — or applies=false
// when the member does not exist on this node's kind, so the caller reports the
// mismatch rather than silently producing nothing.
func emitAccessor(f *shimast.NodeFactory, binding *valueimport.Binding, d *derived, accessor string) (*shimast.Node, bool) {
	switch accessor {
	case "kind":
		return f.NewStringLiteral(kindName(d), shimast.TokenFlagsNone), true
	case "returnType":
		if d.kind != derivedFunc {
			return nil, false
		}
		return emitDerived(f, binding, d.ret), true
	case "instanceType":
		if d.kind != derivedCtor {
			return nil, false
		}
		return emitDerived(f, binding, d.ret), true
	case "args":
		if d.kind != derivedFunc && d.kind != derivedCtor {
			return nil, false
		}
		items := make([]*shimast.Node, 0, len(d.args))
		for _, a := range d.args {
			items = append(items, emitDerived(f, binding, a))
		}
		return f.NewArrayLiteralExpression(f.NewNodeList(items), false), true
	case "tag":
		if d.kind != derivedTag {
			return nil, false
		}
		return f.NewStringLiteral(d.tag, shimast.TokenFlagsNone), true
	case "type":
		if d.kind != derivedTag {
			return nil, false
		}
		return emitDerived(f, binding, d.inner), true
	case "value":
		if d.kind != derivedLeaf || d.leaf.Kind != tokens.TypeNodeLiteral {
			return nil, false
		}
		return literalExpr(f, d.leaf.Literal), true
	default:
		return nil, false
	}
}

// emitDerived builds the `Type.*` factory-call expression a derived node spells,
// recursing into a Func/Ctor's return and parameters and a Tag's inner type.
func emitDerived(f *shimast.NodeFactory, binding *valueimport.Binding, d *derived) *shimast.Node {
	switch d.kind {
	case derivedFunc:
		return typeCall(f, binding, "func", signatureShapedArgs(f, binding, d))
	case derivedCtor:
		return typeCall(f, binding, "ctor", signatureShapedArgs(f, binding, d))
	case derivedTag:
		return typeCall(f, binding, "tag", []*shimast.Node{
			emitDerived(f, binding, d.inner),
			f.NewStringLiteral(d.tag, shimast.TokenFlagsNone),
		})
	default: // derivedLeaf
		return emitLeaf(f, binding, d.leaf)
	}
}

// signatureShapedArgs builds a Func/Ctor call's argument list: the return /
// instance type first, then each parameter type in order — `func(returnType,
// ...args)` and `ctor(instanceType, ...args)` share this exact shape.
func signatureShapedArgs(f *shimast.NodeFactory, binding *valueimport.Binding, d *derived) []*shimast.Node {
	out := make([]*shimast.Node, 0, len(d.args)+1)
	out = append(out, emitDerived(f, binding, d.ret))
	for _, a := range d.args {
		out = append(out, emitDerived(f, binding, a))
	}
	return out
}

// emitLeaf builds the `Type.*` factory-call expression a tokens.TypeNode
// spells — the structural twin of the flat-string renderer in
// internal/tokens/typenode.go, over the SAME tree.
func emitLeaf(f *shimast.NodeFactory, binding *valueimport.Binding, n *tokens.TypeNode) *shimast.Node {
	switch n.Kind {
	case tokens.TypeNodeLiteral:
		return typeCall(f, binding, "typeLiteral", []*shimast.Node{literalExpr(f, n.Literal)})
	case tokens.TypeNodeUnion:
		members := make([]*shimast.Node, 0, len(n.Members))
		for _, m := range n.Members {
			members = append(members, emitLeaf(f, binding, m))
		}
		return typeCall(f, binding, "union", members)
	case tokens.TypeNodePlaceholder:
		return typeCall(f, binding, "generic", []*shimast.Node{f.NewStringLiteral(n.Label, shimast.TokenFlagsNone)})
	default: // tokens.TypeNodeNamed
		args := make([]*shimast.Node, 0, len(n.Args))
		for _, a := range n.Args {
			args = append(args, emitLeaf(f, binding, a))
		}
		callArgs := []*shimast.Node{
			f.NewStringLiteral(n.Name, shimast.TokenFlagsNone),
			f.NewStringLiteral(n.From, shimast.TokenFlagsNone),
		}
		if len(args) != 0 {
			callArgs = append(callArgs, f.NewArrayLiteralExpression(f.NewNodeList(args), false))
		}
		return typeCall(f, binding, "named", callArgs)
	}
}

// typeCall builds `<Type>.<method>(...args)`, marking binding as referenced so
// the caller knows to materialize its import.
func typeCall(f *shimast.NodeFactory, binding *valueimport.Binding, method string, args []*shimast.Node) *shimast.Node {
	binding.Used = true
	callee := f.NewPropertyAccessExpression(binding.Expr(f), nil, f.NewIdentifier(method), 0)
	return f.NewCallExpression(callee, nil, nil, f.NewNodeList(args), 0)
}

// literalExpr renders a literal value as its TS literal expression — a string /
// boolean keyword, a numeric / bigint literal (negative rendered as a unary minus
// over the magnitude). Null/Undefined never reach a TypeNodeLiteral (tokens'
// literalNodeValue excludes them, since `Type.typeLiteral` takes a scalar JS
// value with no runtime-representable null/undefined literal type distinct from
// the value itself), so those two LiteralKind cases have no branch here.
func literalExpr(f *shimast.NodeFactory, v tokens.LiteralValue) *shimast.Node {
	switch v.Kind {
	case tokens.LiteralString:
		return f.NewStringLiteral(v.Str, shimast.TokenFlagsNone)
	case tokens.LiteralBoolean:
		if v.Bool {
			return f.NewKeywordExpression(shimast.KindTrueKeyword)
		}
		return f.NewKeywordExpression(shimast.KindFalseKeyword)
	case tokens.LiteralBigInt:
		lit := f.NewBigIntLiteral(v.Text+"n", shimast.TokenFlagsNone)
		if v.Negated {
			return f.NewPrefixUnaryExpression(shimast.KindMinusToken, lit)
		}
		return lit
	default: // LiteralNumber
		lit := f.NewNumericLiteral(v.Text, shimast.TokenFlagsNone)
		if v.Negated {
			return f.NewPrefixUnaryExpression(shimast.KindMinusToken, lit)
		}
		return lit
	}
}

package typefortransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typeemit"
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
// Func/Ctor beneath the tag), then a construct signature (ConstructorType —
// checked before call, matching TypeFor<T>'s own conditional order), then a call
// signature (FunctionType), and otherwise the plain tokens.DeriveTypeF leaf. Each
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
			if d.leaf.From == typeemit.GlobalFrom {
				return "global"
			}
			return "import"
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
		return typeemit.Literal(f, d.leaf.Literal), true
	default:
		return nil, false
	}
}

// emitDerived builds the `Type.*` factory-call expression a derived node spells,
// recursing into a Func/Ctor's return and parameters and a Tag's inner type.
func emitDerived(f *shimast.NodeFactory, binding *valueimport.Binding, d *derived) *shimast.Node {
	switch d.kind {
	case derivedFunc:
		return typeemit.Call(f, binding, "func", signatureShapedArgs(f, binding, d))
	case derivedCtor:
		return typeemit.Call(f, binding, "ctor", signatureShapedArgs(f, binding, d))
	case derivedTag:
		return typeemit.Call(f, binding, "tag", []*shimast.Node{
			emitDerived(f, binding, d.inner),
			f.NewStringLiteral(d.tag, shimast.TokenFlagsNone),
		})
	default: // derivedLeaf
		return typeemit.Leaf(f, binding, d.leaf)
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

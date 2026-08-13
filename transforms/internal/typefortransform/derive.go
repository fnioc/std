package typefortransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typeemit"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// emitAccessor projects a TypeBase member name onto a derived node, returning the
// AST expression the property access folds to and applies=true — or applies=false
// when the member does not exist on this node's kind, so the caller reports the
// mismatch rather than silently producing nothing.
func emitAccessor(f *shimast.NodeFactory, binding *valueimport.Binding, d *tokens.Derived, accessor string) (*shimast.Node, bool) {
	switch accessor {
	case "kind":
		return f.NewStringLiteral(tokens.KindName(d), shimast.TokenFlagsNone), true
	case "returnType":
		if d.Kind != tokens.DerivedFunc {
			return nil, false
		}
		return typeemit.EmitDerived(f, binding, d.Ret), true
	case "instanceType":
		if d.Kind != tokens.DerivedCtor {
			return nil, false
		}
		return typeemit.EmitDerived(f, binding, d.Ret), true
	case "args":
		if d.Kind != tokens.DerivedFunc && d.Kind != tokens.DerivedCtor {
			return nil, false
		}
		items := make([]*shimast.Node, 0, len(d.Args))
		for _, a := range d.Args {
			items = append(items, typeemit.EmitDerived(f, binding, a))
		}
		return f.NewArrayLiteralExpression(f.NewNodeList(items), false), true
	case "tag":
		if d.Kind != tokens.DerivedTag {
			return nil, false
		}
		return f.NewStringLiteral(d.Tag, shimast.TokenFlagsNone), true
	case "type":
		if d.Kind != tokens.DerivedTag {
			return nil, false
		}
		return typeemit.EmitDerived(f, binding, d.Inner), true
	case "value":
		if d.Kind != tokens.DerivedLeaf || d.Leaf.Kind != tokens.TypeNodeLiteral {
			return nil, false
		}
		return typeemit.Literal(f, d.Leaf.Literal), true
	default:
		return nil, false
	}
}

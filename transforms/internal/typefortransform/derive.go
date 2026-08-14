package typefortransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typeemit"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// emitter turns a derived tree into the expression that replaces a matched
// typefor call. inlineEmitter spells the whole `Type.*` tree at the call site;
// hoistEmitter references one const per distinct type and leaves the trees in
// the project's generated module. node returns nil when the emission failed —
// the emitter has already reported why, and the caller leaves the original node
// alone.
type emitter interface {
	node(d *tokens.Derived) *shimast.Node
}

// inlineEmitter spells a derived tree as the `Type.*` factory calls themselves,
// at the call site.
type inlineEmitter struct {
	factory *shimast.NodeFactory
	binding *valueimport.Binding
}

func (e *inlineEmitter) node(d *tokens.Derived) *shimast.Node {
	return typeemit.EmitDerived(e.factory, e.binding, d)
}

// emitAccessor projects a TypeBase member name onto a derived node, returning the
// AST expression the property access folds to and applies=true — or applies=false
// when the member does not exist on this node's kind, so the caller reports the
// mismatch rather than silently producing nothing.
func emitAccessor(f *shimast.NodeFactory, e emitter, d *tokens.Derived, accessor string) (*shimast.Node, bool) {
	switch accessor {
	case "kind":
		return f.NewStringLiteral(tokens.KindName(d), shimast.TokenFlagsNone), true
	case "returnType":
		if d.Kind != tokens.DerivedFunc {
			return nil, false
		}
		return e.node(d.Ret), true
	case "instanceType":
		if d.Kind != tokens.DerivedCtor {
			return nil, false
		}
		return e.node(d.Ret), true
	case "args":
		if d.Kind != tokens.DerivedFunc && d.Kind != tokens.DerivedCtor {
			return nil, false
		}
		rows := make([]*shimast.Node, 0, len(d.Args))
		for _, row := range d.Args {
			items := make([]*shimast.Node, 0, len(row))
			for _, a := range row {
				item := e.node(a)
				if item == nil {
					return nil, true
				}
				items = append(items, item)
			}
			rows = append(rows, f.NewArrayLiteralExpression(f.NewNodeList(items), false))
		}
		return f.NewArrayLiteralExpression(f.NewNodeList(rows), false), true
	case "tag":
		if d.Kind != tokens.DerivedTag {
			return nil, false
		}
		return f.NewStringLiteral(d.Tag, shimast.TokenFlagsNone), true
	case "type":
		if d.Kind != tokens.DerivedTag {
			return nil, false
		}
		return e.node(d.Inner), true
	case "value":
		if d.Kind != tokens.DerivedLeaf || d.Leaf.Kind != tokens.TypeNodeLiteral {
			return nil, false
		}
		return typeemit.Literal(f, d.Leaf.Literal), true
	default:
		return nil, false
	}
}

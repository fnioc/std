package typeemit

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// EmitDerived builds the `Type.*` factory-call expression a tokens.Derived node
// spells, recursing into a Func/Ctor's head and parameter rows and a Tag's inner
// type.
func EmitDerived(f *shimast.NodeFactory, binding *valueimport.Binding, d *tokens.Derived) *shimast.Node {
	switch d.Kind {
	case tokens.DerivedFunc:
		return signatureShaped(f, binding, d, "func", "returnType")
	case tokens.DerivedCtor:
		return signatureShaped(f, binding, d, "ctor", "instanceType")
	case tokens.DerivedTag:
		return Call(f, binding, "tag", []*shimast.Node{
			EmitDerived(f, binding, d.Inner),
			f.NewStringLiteral(d.Tag, shimast.TokenFlagsNone),
		})
	case tokens.DerivedUnion:
		members := make([]*shimast.Node, 0, len(d.Members))
		for _, m := range d.Members {
			members = append(members, EmitDerived(f, binding, m))
		}
		return Call(f, binding, "union", members)
	case tokens.DerivedUndefined:
		return Undefined(f, binding)
	case tokens.DerivedNull:
		return Call(f, binding, "typeLiteral", []*shimast.Node{f.NewKeywordExpression(shimast.KindNullKeyword)})
	default: // tokens.DerivedLeaf
		return Leaf(f, binding, d.Leaf)
	}
}

// signatureShaped builds a callable's factory call. A callable answering to ONE
// call spells flat — `func(returnType, ...args)` / `ctor(instanceType, ...args)`,
// the shape a hand-writer reaches for. One answering to several spells through
// the object door — `func({ returnType, args: [[…], […]] })` — which is the only
// one that names every parameter row. head is the field the object door files the
// return / instance type under.
func signatureShaped(f *shimast.NodeFactory, binding *valueimport.Binding, d *tokens.Derived,
	method, head string) *shimast.Node {
	if len(d.Args) == 1 {
		flat := make([]*shimast.Node, 0, len(d.Args[0])+1)
		flat = append(flat, EmitDerived(f, binding, d.Ret))
		flat = append(flat, EmitRow(f, binding, d.Args[0])...)
		return Call(f, binding, method, flat)
	}
	spec := f.NewObjectLiteralExpression(f.NewNodeList([]*shimast.Node{
		f.NewPropertyAssignment(nil, f.NewIdentifier(head), nil, nil, EmitDerived(f, binding, d.Ret)),
		f.NewPropertyAssignment(nil, f.NewIdentifier("args"), nil, nil, EmitRows(f, binding, d.Args)),
	}), false)
	return Call(f, binding, method, []*shimast.Node{spec})
}

// EmitRow builds the factory call for each parameter in one row, in order.
func EmitRow(f *shimast.NodeFactory, binding *valueimport.Binding, row []*tokens.Derived) []*shimast.Node {
	out := make([]*shimast.Node, 0, len(row))
	for _, a := range row {
		out = append(out, EmitDerived(f, binding, a))
	}
	return out
}

// EmitRows builds a callable's parameter rows as one array literal of arrays —
// the shape the `args` field of a `Type.func` / `Type.ctor` spec takes.
func EmitRows(f *shimast.NodeFactory, binding *valueimport.Binding, rows [][]*tokens.Derived) *shimast.Node {
	items := make([]*shimast.Node, 0, len(rows))
	for _, row := range rows {
		items = append(items, f.NewArrayLiteralExpression(f.NewNodeList(EmitRow(f, binding, row)), false))
	}
	return f.NewArrayLiteralExpression(f.NewNodeList(items), false)
}

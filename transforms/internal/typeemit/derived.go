package typeemit

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// EmitDerived builds the `Type.*` factory-call expression a tokens.Derived node
// spells, recursing into a Func/Ctor's return and parameters and a Tag's inner
// type.
func EmitDerived(f *shimast.NodeFactory, binding *valueimport.Binding, d *tokens.Derived) *shimast.Node {
	switch d.Kind {
	case tokens.DerivedFunc:
		return Call(f, binding, "func", signatureShapedArgs(f, binding, d))
	case tokens.DerivedCtor:
		return Call(f, binding, "ctor", signatureShapedArgs(f, binding, d))
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

// signatureShapedArgs builds a Func/Ctor call's argument list: the return /
// instance type first, then each parameter type in order — `func(returnType,
// ...args)` and `ctor(instanceType, ...args)` share this exact shape.
func signatureShapedArgs(f *shimast.NodeFactory, binding *valueimport.Binding, d *tokens.Derived) []*shimast.Node {
	out := make([]*shimast.Node, 0, len(d.Args)+1)
	out = append(out, EmitDerived(f, binding, d.Ret))
	for _, a := range d.Args {
		out = append(out, EmitDerived(f, binding, a))
	}
	return out
}

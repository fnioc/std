// Package typeemit builds the `Type.*` factory-call expressions a lowered
// primitive leaves behind — the runtime spelling of a derived type, identical to
// what an author would have written by hand.
//
// Every primitive that emits a Type tree shares this vocabulary, so a leaf spells
// the same whichever primitive produced it: `string` is always
// `Type.global("string")`, an `Array<T>` always carries its element as a single
// generic argument, a literal always its own scalar expression.
//
// The `Type` object is referenced through a valueimport.Binding, so an
// existing (possibly aliased) import in the consuming file is honored and a fresh
// one is injected only when at least one call was emitted.
package typeemit

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueimport"
)

// Ref identifies the runtime `Type` object every emitted factory call
// reaches through.
var Ref = valueimport.Ref{Module: "@rhombus-std/primitives", Export: "Type"}

// GlobalFrom is the FROM a derived name carries when the ambient scope declares
// it. Such a type is reached by no import, so it spells as `Type.global`.
const GlobalFrom = "global"

// Call builds `<Type>.<method>(...args)`, marking binding as referenced so the
// caller knows to materialize its import.
func Call(f *shimast.NodeFactory, binding *valueimport.Binding, method string, args []*shimast.Node) *shimast.Node {
	binding.Used = true
	callee := f.NewPropertyAccessExpression(binding.Expr(f), nil, f.NewIdentifier(method), 0)
	return f.NewCallExpression(callee, nil, nil, f.NewNodeList(args), 0)
}

// Leaf builds the factory call a tokens.TypeNode spells — the structural twin of
// the flat-string renderer in internal/tokens, over the SAME tree.
func Leaf(f *shimast.NodeFactory, binding *valueimport.Binding, n *tokens.TypeNode) *shimast.Node {
	switch n.Kind {
	case tokens.TypeNodeLiteral:
		return Call(f, binding, "typeLiteral", []*shimast.Node{Literal(f, n.Literal)})
	case tokens.TypeNodeUnion:
		members := make([]*shimast.Node, 0, len(n.Members))
		for _, m := range n.Members {
			members = append(members, Leaf(f, binding, m))
		}
		return Call(f, binding, "union", members)
	case tokens.TypeNodePlaceholder:
		return Call(f, binding, "generic", []*shimast.Node{f.NewStringLiteral(n.Label, shimast.TokenFlagsNone)})
	default: // tokens.TypeNodeNamed
		args := make([]*shimast.Node, 0, len(n.Args))
		for _, a := range n.Args {
			args = append(args, Leaf(f, binding, a))
		}
		return Named(f, binding, n.Name, n.From, args)
	}
}

// Named builds the factory call a name-addressed type spells: `Type.global(name)`
// when the ambient scope declares it, `Type.imported(name, from)` when an import
// reaches it, each followed by its generic arguments as one array when it has any.
func Named(f *shimast.NodeFactory, binding *valueimport.Binding, name, from string, args []*shimast.Node) *shimast.Node {
	method := "global"
	callArgs := []*shimast.Node{f.NewStringLiteral(name, shimast.TokenFlagsNone)}
	if from != GlobalFrom {
		method = "imported"
		callArgs = append(callArgs, f.NewStringLiteral(from, shimast.TokenFlagsNone))
	}
	if len(args) != 0 {
		callArgs = append(callArgs, f.NewArrayLiteralExpression(f.NewNodeList(args), false))
	}
	return Call(f, binding, method, callArgs)
}

// Literal renders a literal value as its TS literal expression — a string /
// boolean keyword, a numeric / bigint literal (negative rendered as a unary minus
// over the magnitude). Null/Undefined never reach a TypeNodeLiteral (tokens'
// literalNodeValue excludes them, since `Type.typeLiteral` takes a scalar JS
// value with no runtime-representable null/undefined literal type distinct from
// the value itself), so those two LiteralKind cases have no branch here.
func Literal(f *shimast.NodeFactory, v tokens.LiteralValue) *shimast.Node {
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

// Undefined is the `undefined` literal type's factory call — the member an
// optional slot carries beside its own type. `Type.typeLiteral(undefined)` has no
// tokens.LiteralValue spelling (the token grammar excludes the nullish
// singletons), so it is built directly.
func Undefined(f *shimast.NodeFactory, binding *valueimport.Binding) *shimast.Node {
	return Call(f, binding, "typeLiteral", []*shimast.Node{f.NewIdentifier("undefined")})
}

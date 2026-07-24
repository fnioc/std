// Package foldtransform is a generic constant-fold / dead-branch-prune stage: a
// conditional (ternary) expression whose CONDITION is a boolean literal folds to
// the taken branch — `true ? A : B` -> A, `false ? A : B` -> B. It carries NO
// domain knowledge (it never inspects which primitive produced the literal or what
// the branches contain); it is a pure AST simplification.
//
// Its job in the pipeline (§94): the resolve-family sugar body branches
// `isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>())`. The singular
// stage lowers `isSingular<T>()` to a boolean literal, and this stage then prunes
// the dead branch, so a `singularValue<T>()` in the non-taken arm (which the
// singular stage left un-lowered because its T is not singular) is REMOVED before
// the emit sweep runs — the fold is what keeps a dead-branch primitive from
// tripping the sweep, and what makes a surviving unguarded `singularValue<T>()` the
// only case the sweep's targeted diagnostic must handle.
//
// It runs under the fixed-point loop. It is identity-preserving on a no-op (a file
// with no boolean-literal ternary returns the identical *SourceFile pointer), so it
// never keeps the loop from settling. The single owner host composes it as the
// `rhombusstd_fold` stage.
package foldtransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// New builds the per-file fold transform. It visits every node; children are
// folded first (post-order), so a nested boolean-literal ternary collapses in the
// same pass its enclosing one does. A conditional whose condition is a boolean
// literal is replaced by the taken branch; every other node passes through
// unchanged (identity preserved).
//
// One extra scoped simplification (PRE-order): a parenthesized expression that
// DIRECTLY wraps a boolean-literal conditional — the inline stage's precedence
// wrapper around a substituted ternary body — is folded, and the redundant paren
// is dropped when the taken branch is self-delimiting. This keeps the lowered
// output byte-identical to the hand-written form (`provider.resolve("t")`, not
// `(provider.resolve("t"))`): the inline substitution parenthesizes the ternary so
// it splices safely, and once the ternary collapses to a call/literal the paren is
// gone. It is SCOPED to paren-around-conditional (an ordinary authored paren, which
// wraps no boolean-literal conditional, is never touched), and the paren is KEPT
// around a non-primary branch so precedence is preserved.
func New(_ *driver.Program, _ func(plugin.Diagnostic)) plugin.FileTransform {
	return func(ec *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		factory := ec.Factory.AsNodeFactory()
		var visitor *shimast.NodeVisitor
		visit := func(node *shimast.Node) *shimast.Node {
			if node == nil {
				return nil
			}
			if folded, ok := foldParenWrappedConditional(visitor, factory, node); ok {
				return folded
			}
			visited := visitor.VisitEachChild(node)
			if visited.Kind != shimast.KindConditionalExpression {
				return visited
			}
			if taken, ok := takenBranch(visited.AsConditionalExpression()); ok {
				return taken
			}
			return visited
		}
		visitor = ec.NewNodeVisitor(visit)
		output := visitor.VisitNode(sf.AsNode())
		if output == nil {
			return sf
		}
		return output.AsSourceFile()
	}
}

// foldParenWrappedConditional folds a `(<bool-literal> ? A : B)` — a parenthesized
// boolean-literal conditional — to its taken branch (with the branch's own children
// folded), dropping the paren when the branch is self-delimiting and keeping it
// otherwise. ok is false when node is not a paren directly wrapping a boolean-literal
// conditional, so every other node takes the normal post-order path.
func foldParenWrappedConditional(visitor *shimast.NodeVisitor, factory *shimast.NodeFactory, node *shimast.Node) (*shimast.Node, bool) {
	if node.Kind != shimast.KindParenthesizedExpression {
		return nil, false
	}
	inner := node.AsParenthesizedExpression().Expression
	if inner == nil || inner.Kind != shimast.KindConditionalExpression {
		return nil, false
	}
	taken, ok := takenBranch(inner.AsConditionalExpression())
	if !ok {
		return nil, false
	}
	folded := visitor.VisitNode(taken)
	if isSelfDelimiting(folded) {
		return folded, true
	}
	return factory.NewParenthesizedExpression(folded), true
}

// isSelfDelimiting reports whether expr needs no surrounding parentheses to splice
// into an arbitrary expression context — a primary / call-like expression. It
// mirrors the inline stage's wrapForPrecedence no-wrap set, so a paren the inline
// stage added around a body that folds to one of these forms is safely removable.
func isSelfDelimiting(expr *shimast.Node) bool {
	switch expr.Kind {
	case shimast.KindCallExpression, shimast.KindPropertyAccessExpression,
		shimast.KindElementAccessExpression, shimast.KindIdentifier,
		shimast.KindParenthesizedExpression, shimast.KindStringLiteral,
		shimast.KindNumericLiteral, shimast.KindBigIntLiteral, shimast.KindTrueKeyword,
		shimast.KindFalseKeyword, shimast.KindNullKeyword, shimast.KindThisKeyword,
		shimast.KindNewExpression,
		// The singular-value shapes di.core's Rule-2 literalExpression emits that are
		// not plain primaries: `void 0` (undefined) and a `-<n>` unary minus over a
		// negative numeric / bigint literal. Both bind tighter than any surrounding
		// operator, so the wrapper paren is redundant — dropping it matches di-direct's
		// bare `void 0` / `-42`.
		shimast.KindVoidExpression, shimast.KindPrefixUnaryExpression:
		return true
	}
	return false
}

// takenBranch reports the branch a conditional folds to when its condition is a
// boolean literal (unwrapping redundant parentheses around the condition): the
// WhenTrue branch for `true`, the WhenFalse branch for `false`. ok is false when
// the condition is not a (parenthesized) boolean literal, so the conditional is
// left untouched.
func takenBranch(cond *shimast.ConditionalExpression) (*shimast.Node, bool) {
	switch unwrapParens(cond.Condition).Kind {
	case shimast.KindTrueKeyword:
		return cond.WhenTrue, true
	case shimast.KindFalseKeyword:
		return cond.WhenFalse, true
	}
	return nil, false
}

// unwrapParens strips redundant parentheses from an expression so a
// `(true) ? … : …` condition folds the same as a bare `true ? … : …`. The singular
// stage emits a bare boolean keyword, so this only matters for a hand-parenthesized
// or otherwise-wrapped condition, but the unwrap keeps the fold robust.
func unwrapParens(expr *shimast.Node) *shimast.Node {
	for expr != nil && expr.Kind == shimast.KindParenthesizedExpression {
		expr = expr.AsParenthesizedExpression().Expression
	}
	return expr
}

// Package inlinetransform is the generic single-expression function-inlining
// stage: at a consumer call site it substitutes an inlineable declaration's
// single-return-expression body in place of the call, binding `this` to the
// call's receiver and each value parameter to its argument expression. The
// downstream primitive stages (nameof, di, di-options, config) then lower the
// substituted result. It runs FIRST in ttsc-std's canonical stage order.
//
// This file owns the substitution mechanism only — turning a (body, receiver,
// args) triple into one rewritten expression node, with single-evaluation of an
// effectful receiver realized as a temp binding in expression position. Matching
// call sites to inline entries and side-parsing bodies out of a declaring
// package live in sibling files (matcher.go / sideparse.go).
package inlinetransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
)

// Inlining is the fully-resolved substitution plan for one call site. Body is a
// clone-safe reference to the impl's single return expression (the side-parser
// hands it over; Substitute deep-clones before mutating, so the same Body node
// may drive many call sites). Receiver is `x` in `x.member(...)` — nil for a
// free-function inline. Params are the impl's value-parameter names in order,
// paired positionally with Args, the call's argument expressions.
type Inlining struct {
	Body     *shimast.Node
	Receiver *shimast.Node
	Params   []string
	Args     []*shimast.Node
}

// Result is Substitute's output. Expr is the rewritten expression to splice in
// for the call. When NeedsTempHoist is set the mechanism introduced a
// single-evaluation temp (Temp); the CALLER must register that identifier with
// the enclosing variable environment — `ec.AddVariableDeclaration(res.Temp)`
// between a `StartVariableEnvironment`/`EndAndMergeVariableEnvironment` pair
// wrapping the containing function body — so a `var _a;` declaration is emitted.
// Expr already references the temp; without the hoist the emitted temp name is
// undeclared.
type Result struct {
	Expr           *shimast.Node
	Temp           *shimast.Node
	NeedsTempHoist bool
}

// Substitute produces the inlined expression for one call site.
//
// The single-evaluation contract (receiver evaluated exactly once, per the
// authoring discipline) is met by counting `this` occurrences in the body and
// picking the cheapest correct shape:
//
//   - `this` used 0×, effectful receiver  → `(receiver, body)`      — keep the
//     receiver's side effect, discard its value.
//   - `this` used 0×, simple receiver     → `body`                  — a bare
//     identifier/`this` reference has no effect worth keeping.
//   - `this` used 1×                       → receiver inlined at the one site;
//     already single-eval, no temp.
//   - `this` used ≥2×, simple receiver     → receiver duplicated at each site;
//     duplicating an identifier/`this` reference is side-effect-free.
//   - `this` used ≥2×, effectful receiver  → `(_a = receiver, body[this→_a])`
//     — a temp bound once in expression position (comma sequence), so the
//     receiver runs exactly once. NeedsTempHoist is set.
//
// "Simple" is deliberately narrow: only a bare identifier or `this` is safe to
// duplicate. A property access `x.y` is treated as effectful because reading it
// can trigger a getter, and the contract forbids running that getter twice.
func Substitute(ec *shimprinter.EmitContext, in Inlining) Result {
	factory := ec.Factory.AsNodeFactory()
	body := factory.DeepCloneNode(in.Body)

	params := map[string]*shimast.Node{}
	for i, name := range in.Params {
		if i < len(in.Args) {
			params[name] = in.Args[i]
		}
	}

	if in.Receiver == nil {
		// Free function: only value parameters are substituted.
		return Result{Expr: substituteInto(ec, body, params, nil)}
	}

	thisCount := countThis(body)
	simple := isSimpleReceiver(in.Receiver)

	if thisCount >= 2 && !simple {
		// Effectful receiver used more than once: bind it once to a temp in
		// expression position and reference the temp at every `this` site.
		temp := ec.Factory.NewTempVariable()
		substituted := substituteInto(ec, body, params, temp)
		assign := factory.NewBinaryExpression(
			nil,
			temp,
			nil,
			factory.NewToken(shimast.KindEqualsToken),
			factory.DeepCloneNode(in.Receiver),
		)
		sequence := factory.NewBinaryExpression(
			nil,
			assign,
			nil,
			factory.NewToken(shimast.KindCommaToken),
			substituted,
		)
		return Result{
			Expr:           factory.NewParenthesizedExpression(sequence),
			Temp:           temp,
			NeedsTempHoist: true,
		}
	}

	if thisCount == 0 && !simple {
		// Receiver's value is never read, but its side effect must still run
		// exactly once. Keep it as the left of a comma sequence.
		substituted := substituteInto(ec, body, params, nil)
		sequence := factory.NewBinaryExpression(
			nil,
			factory.DeepCloneNode(in.Receiver),
			nil,
			factory.NewToken(shimast.KindCommaToken),
			substituted,
		)
		return Result{Expr: factory.NewParenthesizedExpression(sequence)}
	}

	// `this` used 0× (simple), 1× (any), or ≥2× (simple): inline a fresh clone
	// of the receiver at each `this` site. thisRepl == nil below means "clone
	// the receiver"; a non-nil node (the temp branch above) means "reference it".
	return Result{Expr: substituteIntoReceiver(ec, body, params, in.Receiver)}
}

// substituteInto rewrites body in place of a clone: every `this` becomes temp
// (when non-nil), every value-parameter identifier becomes its argument
// expression. Property-access member names are left untouched so a body member
// that happens to share a parameter's name is never rewritten.
func substituteInto(ec *shimprinter.EmitContext, body *shimast.Node, params map[string]*shimast.Node, temp *shimast.Node) *shimast.Node {
	return rewrite(ec, body, params, func() *shimast.Node { return temp })
}

// substituteIntoReceiver is substituteInto with a fresh receiver clone minted
// for each `this` site rather than a shared temp reference.
func substituteIntoReceiver(ec *shimprinter.EmitContext, body *shimast.Node, params map[string]*shimast.Node, receiver *shimast.Node) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	return rewrite(ec, body, params, func() *shimast.Node {
		return factory.DeepCloneNode(receiver)
	})
}

// rewrite walks body substituting `this` (via thisNode, called once per site so
// each site can get its own clone) and value-parameter identifiers (via params).
// It descends manually through property-access objects so the member name — an
// identifier that is NOT a value reference — is preserved verbatim.
func rewrite(ec *shimprinter.EmitContext, body *shimast.Node, params map[string]*shimast.Node, thisNode func() *shimast.Node) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	var visitor *shimast.NodeVisitor
	visit := func(node *shimast.Node) *shimast.Node {
		if node == nil {
			return nil
		}
		switch node.Kind {
		case shimast.KindThisKeyword:
			if repl := thisNode(); repl != nil {
				return repl
			}
			return node
		case shimast.KindIdentifier:
			if arg, ok := params[node.Text()]; ok {
				return factory.DeepCloneNode(arg)
			}
			return node
		case shimast.KindPropertyAccessExpression:
			access := node.AsPropertyAccessExpression()
			newObject := visitor.VisitNode(access.Expression)
			if newObject == access.Expression {
				return node
			}
			return factory.NewPropertyAccessExpression(newObject, access.QuestionDotToken, access.Name(), 0)
		}
		return visitor.VisitEachChild(node)
	}
	visitor = ec.NewNodeVisitor(visit)
	return visitor.VisitNode(body)
}

// countThis reports how many `this` keywords appear anywhere in node.
func countThis(node *shimast.Node) int {
	count := 0
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil {
			return
		}
		if n.Kind == shimast.KindThisKeyword {
			count++
		}
		n.ForEachChild(func(child *shimast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(node)
	return count
}

// isSimpleReceiver reports whether a receiver expression may be duplicated
// without changing behavior — true only for a bare identifier or `this`.
func isSimpleReceiver(node *shimast.Node) bool {
	return node.Kind == shimast.KindIdentifier || node.Kind == shimast.KindThisKeyword
}

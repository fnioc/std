// Package inlinetransform is the generic single-expression function-inlining
// stage: at a consumer call site it substitutes an inlineable declaration's
// single-return-expression body in place of the call, binding `this` to the
// call's receiver and each value parameter to its argument expression. The
// downstream primitive stages (typefor, schemaof) then lower the substituted
// result. It runs FIRST in ttsc-std's canonical stage order.
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
	// RestParam is the body's trailing rest parameter, if it has one, and RestArgs
	// are the call arguments it stands for. A rest binds to the argument LIST, so
	// it is expanded where the body spreads it rather than substituted as a value.
	RestParam string
	RestArgs  []*shimast.Node
	// Bindings rewrites body identifiers that are not parameters — a value the body
	// reaches through its own file's import, mapped to the way the CONSUMER file
	// names that same export. Keyed by name rather than position, since these bind
	// to nothing in the call's argument list.
	Bindings map[string]*shimast.Node
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

	r := rest{name: in.RestParam, args: in.RestArgs}
	params := map[string]*shimast.Node{}
	for i, name := range in.Params {
		if i < len(in.Args) {
			params[name] = in.Args[i]
		}
	}
	for name, node := range in.Bindings {
		params[name] = node
	}

	if in.Receiver == nil {
		// Free function: only value parameters are substituted.
		return Result{Expr: substituteInto(ec, body, params, nil, r)}
	}

	receiverCount := countThis(body)
	simple := isSimpleReceiver(in.Receiver)

	if receiverCount >= 2 && !simple {
		// Effectful receiver used more than once: bind it once to a temp in
		// expression position and reference the temp at every `this` site.
		temp := ec.Factory.NewTempVariable()
		substituted := substituteInto(ec, body, params, temp, r)
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

	if receiverCount == 0 && !simple {
		// Receiver's value is never read, but its side effect must still run
		// exactly once. Keep it as the left of a comma sequence.
		substituted := substituteInto(ec, body, params, nil, r)
		sequence := factory.NewBinaryExpression(
			nil,
			factory.DeepCloneNode(in.Receiver),
			nil,
			factory.NewToken(shimast.KindCommaToken),
			substituted,
		)
		return Result{Expr: factory.NewParenthesizedExpression(sequence)}
	}

	// Receiver read 0× (simple), 1× (any), or ≥2× (simple): inline a fresh clone
	// of it at each site. thisRepl == nil below means "clone the receiver"; a
	// non-nil node (the temp branch above) means "reference it".
	return Result{Expr: substituteIntoReceiver(ec, body, params, in.Receiver, r)}
}

// substituteInto rewrites body in place of a clone: every `this` becomes temp
// (when non-nil), every value-parameter identifier becomes its argument
// expression. Property-access member names are left untouched so a body member
// that happens to share a parameter's name is never rewritten.
func substituteInto(ec *shimprinter.EmitContext, body *shimast.Node, params map[string]*shimast.Node, temp *shimast.Node, r rest) *shimast.Node {
	return rewrite(ec, body, params, func() *shimast.Node { return temp }, r)
}

// substituteIntoReceiver is substituteInto with the ORIGINAL receiver node
// spliced at the first `this` site and fresh clones at any further sites. The
// original is program-bound, so downstream stages that checker-query the
// receiver get an answerable node; the extra clones are bare and nothing
// downstream queries them (a duplicated `this` site only ever holds a simple,
// side-effect-free receiver by the effectful ≥2× path being handled separately).
func substituteIntoReceiver(ec *shimprinter.EmitContext, body *shimast.Node, params map[string]*shimast.Node, receiver *shimast.Node, r rest) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	first := true
	return rewrite(ec, body, params, func() *shimast.Node {
		if first {
			first = false
			return receiver
		}
		return factory.DeepCloneNode(receiver)
	}, r)
}

// rest carries a body's trailing rest parameter and the arguments it stands for.
type rest struct {
	name string
	args []*shimast.Node
}

// expand replaces a spread of the rest parameter with the arguments it stands
// for, leaving every other argument to the ordinary walk. It reports whether any
// element changed, so an untouched list keeps its original node.
func (r rest) expand(visitor *shimast.NodeVisitor, args []*shimast.Node) ([]*shimast.Node, bool) {
	out := make([]*shimast.Node, 0, len(args))
	changed := false
	for _, arg := range args {
		if r.name != "" && arg.Kind == shimast.KindSpreadElement {
			inner := arg.AsSpreadElement().Expression
			if inner != nil && inner.Kind == shimast.KindIdentifier && inner.Text() == r.name {
				out = append(out, r.args...)
				changed = true
				continue
			}
		}
		visited := visitor.VisitNode(arg)
		if visited != arg {
			changed = true
		}
		out = append(out, visited)
	}
	return out, changed
}

// rewrite walks body substituting `this` (via thisNode, called once per site so
// each site can get its own clone) and value-parameter identifiers (via params).
// It descends manually through property-access objects so the member name — an
// identifier that is NOT a value reference — is preserved verbatim. A `this`
// inside a nested non-arrow function or class is that scope's own receiver, so
// substitution stops at those boundaries; value parameters are still rewritten
// there, since a closure captures them like any other outer binding.
func rewrite(ec *shimprinter.EmitContext, body *shimast.Node, params map[string]*shimast.Node, thisNode func() *shimast.Node, r rest) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	var visitor *shimast.NodeVisitor
	ownThisDepth := 0
	visit := func(node *shimast.Node) *shimast.Node {
		if node == nil {
			return nil
		}
		if establishesThis(node) {
			ownThisDepth++
			result := visitor.VisitEachChild(node)
			ownThisDepth--
			return result
		}
		switch node.Kind {
		case shimast.KindThisKeyword:
			if ownThisDepth > 0 {
				return node
			}
			if repl := thisNode(); repl != nil {
				return repl
			}
			return node
		case shimast.KindIdentifier:
			if arg, ok := params[node.Text()]; ok {
				// Splice the ORIGINAL argument node (same pointer at every site):
				// positioned nodes print from source text, so reuse is print-safe,
				// and checker queries hit the one real binding. The authoring lint
				// bounds a value param to at most one runtime-position occurrence;
				// primitive-position occurrences may repeat and deliberately alias.
				return arg
			}
			return node
		case shimast.KindPropertyAccessExpression:
			access := node.AsPropertyAccessExpression()
			newObject := visitor.VisitNode(access.Expression)
			if newObject == access.Expression {
				return node
			}
			return factory.NewPropertyAccessExpression(newObject, access.QuestionDotToken, access.Name(), 0)
		case shimast.KindCallExpression:
			call := node.AsCallExpression()
			if call.Arguments == nil {
				break
			}
			newCallee := visitor.VisitNode(call.Expression)
			args, changed := r.expand(visitor, call.Arguments.Nodes)
			if !changed && newCallee == call.Expression {
				return node
			}
			return factory.NewCallExpression(newCallee, call.QuestionDotToken, nil, factory.NewNodeList(args), 0)
		}
		return visitor.VisitEachChild(node)
	}
	visitor = ec.NewNodeVisitor(visit)
	return visitor.VisitNode(body)
}

// countThis reports how many substitutable `this` keywords appear in node —
// the same sites rewrite replaces, so the two agree on the receiver's use
// count. A `this` behind a nested non-arrow function or class boundary belongs
// to that scope and is not counted.
func countThis(node *shimast.Node) int {
	count := 0
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil || establishesThis(n) {
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

// establishesThis reports whether node introduces its own `this` scope — a
// non-arrow function, method, accessor, constructor, class, or class static
// block. Arrows inherit the enclosing `this` and are never boundaries.
func establishesThis(node *shimast.Node) bool {
	switch node.Kind {
	case shimast.KindFunctionExpression,
		shimast.KindFunctionDeclaration,
		shimast.KindMethodDeclaration,
		shimast.KindGetAccessor,
		shimast.KindSetAccessor,
		shimast.KindConstructor,
		shimast.KindClassDeclaration,
		shimast.KindClassExpression,
		shimast.KindClassStaticBlockDeclaration:
		return true
	}
	return false
}

// isSimpleReceiver reports whether a receiver expression may be duplicated
// without changing behavior — true only for a bare identifier or `this`.
func isSimpleReceiver(node *shimast.Node) bool {
	return node.Kind == shimast.KindIdentifier || node.Kind == shimast.KindThisKeyword
}

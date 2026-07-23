package ditransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokens"
)

const nameofName = "tokenfor"

var tokenlessResolveMethods = map[string]bool{
	"resolve":      true,
	"resolveAsync": true,
	"tryResolve":   true,
}

// isTokenlessResolveCall reports a tokenless `*.resolve<I>()` /
// `*.resolveAsync<I>()` / `*.tryResolve<I>()` (1 type arg, 0 value args) whose
// method resolves to IRequiredResolver / IResolver inside
// `declare module '@rhombus-std/di.core'` — so `resolve<T>()` on an unrelated
// object is never lowered.
func isTokenlessResolveCall(checker *shimchecker.Checker, call *shimast.Node) bool {
	callee := call.AsCallExpression().Expression
	if callee.Kind != shimast.KindPropertyAccessExpression {
		return false
	}
	if !tokenlessResolveMethods[callee.Name().Text()] {
		return false
	}
	if len(callTypeArgs(call)) != 1 {
		return false
	}
	if len(callArguments(call)) != 0 {
		return false
	}
	return memberAnchoredOnDiCore(checker, callee.Name(), resolveInterfaces)
}

// isTokenlessIsServiceCall reports a tokenless `*.isService<I>()` predicate whose
// isService member resolves to IServiceQuery inside
// `declare module '@rhombus-std/di.core'`.
func isTokenlessIsServiceCall(checker *shimchecker.Checker, call *shimast.Node) bool {
	callee := call.AsCallExpression().Expression
	if callee.Kind != shimast.KindPropertyAccessExpression {
		return false
	}
	if callee.Name().Text() != "isService" {
		return false
	}
	if len(callTypeArgs(call)) != 1 {
		return false
	}
	if len(callArguments(call)) != 0 {
		return false
	}
	return memberAnchoredOnDiCore(checker, callee.Name(), isServiceInterfaces)
}

// lowerIsServiceCall rewrites `*.isService<I>()` to `*.isService("<token>")`.
func (c *context) lowerIsServiceCall(call *shimast.Node) *shimast.Node {
	typeArg := callTypeArgs(call)[0]
	token, ok := tokens.DeriveTokenF(c.tokens, c.checker.GetTypeFromTypeNode(typeArg), nil)
	var tokenLit *shimast.Node
	if ok {
		tokenLit = c.stringLit(token)
	} else {
		tokenLit = c.factory.NewKeywordExpression(shimast.KindNullKeyword)
	}
	return c.factory.NewCallExpression(call.AsCallExpression().Expression, nil, nil, c.factory.NewNodeList([]*shimast.Node{tokenLit}), 0)
}

// lowerResolveCall rewrites a tokenless resolve family call to its string-token
// or factory form (or, for a singular type arg, the value expression itself).
func (c *context) lowerResolveCall(call *shimast.Node) *shimast.Node {
	callee := call.AsCallExpression().Expression
	typeArg := callTypeArgs(call)[0]
	isFunctionType := typeArg.Kind == shimast.KindFunctionType

	// Rule 2: singular T → emit the value, not a resolve call.
	if !isFunctionType {
		if singleton, ok := tokens.SingletonValue(c.checker.GetTypeFromTypeNode(typeArg)); ok {
			return c.literalExpression(singleton)
		}
	}

	method := callee.Name().Text()
	var token string
	var hasToken bool
	var paramTokens []string
	hasParams := false

	if isFunctionType {
		method = "resolveFactory"
		sig := c.signatureOfFunctionTypeNode(typeArg)
		if sig != nil {
			token, hasToken = tokens.TokenForReturnType(c.tokens, sig)
			paramTokens = []string{}
			hasParams = true
			for _, ps := range shimchecker.Signature_parameters(sig) {
				decl := symbolValueDeclaration(ps)
				if decl == nil || decl.Kind != shimast.KindParameter {
					paramTokens = nil
					hasParams = false
					break
				}
				paramType := c.checker.GetTypeAtLocation(decl)
				if branded, ok := tokens.InjectTokenFor(paramType, c.checker); ok {
					paramTokens = append(paramTokens, branded)
					continue
				}
				if tokenText, ok := tokens.TokenForType(c.tokens, paramType, nil); ok {
					paramTokens = append(paramTokens, tokenText)
				} else {
					c.emitError(paramTypeNodeOr(decl), codeUnderivableToken,
						"cannot derive a token for this type — name the type or brand the parameter with `Inject<T, 'my:token'>`")
					paramTokens = append(paramTokens, unresolvableSentinel)
				}
			}
		}
	} else {
		token, hasToken = tokens.DeriveTokenF(c.tokens, c.checker.GetTypeFromTypeNode(typeArg), nil)
	}

	var newCallee *shimast.Node
	if method == callee.Name().Text() {
		newCallee = callee
	} else {
		object := callee.AsPropertyAccessExpression().Expression
		newCallee = c.factory.NewPropertyAccessExpression(object, nil, c.factory.NewIdentifier(method), 0)
	}

	var tokenLit *shimast.Node
	if hasToken {
		tokenLit = c.stringLit(token)
	} else {
		tokenLit = c.factory.NewKeywordExpression(shimast.KindNullKeyword)
	}
	args := []*shimast.Node{tokenLit}
	if hasParams && len(paramTokens) != 0 {
		lits := make([]*shimast.Node, 0, len(paramTokens))
		for _, p := range paramTokens {
			lits = append(lits, c.stringLit(p))
		}
		args = append(args, c.arrayLit(lits))
	}
	return c.factory.NewCallExpression(newCallee, nil, nil, c.factory.NewNodeList(args), 0)
}

// isNameofCall reports a single-type-argument call whose callee resolves to the
// `nameof` symbol (following an import alias) or is spelled `nameof` directly.
func (c *context) isNameofCall(call *shimast.Node) bool {
	if len(callTypeArgs(call)) != 1 {
		return false
	}
	callee := call.AsCallExpression().Expression
	var id *shimast.Node
	switch callee.Kind {
	case shimast.KindIdentifier:
		id = callee
	case shimast.KindPropertyAccessExpression:
		id = callee.Name()
	default:
		return false
	}
	if id.Text() == nameofName {
		return true
	}
	// Past the spelling check, the symbol lookup needs the same synthetic-node
	// guard nameoftransform.isNameofCall documents at length: a callee with no
	// program position, or one whose `Parent` link the factory never re-established
	// after rebuilding it around a replaced child, nil-panics inside
	// GetSymbolAtLocation (it derefs `Parent.Parent` unconditionally). Under the
	// immutable manifest a registration statement is an ASSIGNMENT (`services =
	// services.addClass<T>(C)`), so lowering rebuilds the enclosing binary expression
	// and hands this visitor a partially synthetic tree where it used to see a
	// fully lowered one. Such a node was never checked, so it can never BE the
	// checker's nameof: a clean non-match is the right answer.
	if callee.Pos() < 0 || callee.Parent == nil {
		return false
	}
	symbol := c.checker.GetSymbolAtLocation(callee)
	if symbol == nil {
		return false
	}
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := c.checker.GetAliasedSymbol(symbol); aliased != nil {
			symbol = aliased
		}
	}
	return symbol.Name == nameofName
}

// rewriteNameof replaces every `nameof<T>()` call within node with its token.
func (c *context) rewriteNameof(node *shimast.Node) *shimast.Node {
	var visitor *shimast.NodeVisitor
	visit := func(n *shimast.Node) *shimast.Node {
		if n == nil {
			return nil
		}
		if n.Kind == shimast.KindCallExpression && c.isNameofCall(n) {
			typeArg := callTypeArgs(n)[0]
			token, ok := tokens.DeriveTokenF(c.tokens, c.checker.GetTypeFromTypeNode(typeArg), nil)
			if !ok {
				return c.stringLit("")
			}
			return c.stringLit(token)
		}
		return visitor.VisitEachChild(n)
	}
	visitor = c.ec.NewNodeVisitor(visit)
	return visitor.VisitNode(node)
}

// rewriteResolve rewrites every tokenless resolve/isService call within node.
func (c *context) rewriteResolve(node *shimast.Node) *shimast.Node {
	var visitor *shimast.NodeVisitor
	visit := func(n *shimast.Node) *shimast.Node {
		if n == nil {
			return nil
		}
		visited := visitor.VisitEachChild(n)
		if visited.Kind == shimast.KindCallExpression {
			if isTokenlessResolveCall(c.checker, visited) {
				return c.lowerResolveCall(visited)
			}
			if isTokenlessIsServiceCall(c.checker, visited) {
				return c.lowerIsServiceCall(visited)
			}
		}
		return visited
	}
	visitor = c.ec.NewNodeVisitor(visit)
	return visitor.VisitNode(node)
}

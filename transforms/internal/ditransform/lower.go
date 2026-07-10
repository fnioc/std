package ditransform

import (
	"sort"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/tokentext"
)

// foundReg is a registration call found on the original expression.
type foundReg struct {
	call        *shimast.Node
	method      string // "add" | "addValue" | "addFactory"
	typeArg     *shimast.Node
	arg         *shimast.Node
	overrideArg *shimast.Node
}

// regPlan is the rewrite plan for one registration call.
type regPlan struct {
	token         string
	hasToken      bool
	calleeMethod  string // "add" | "addFactory" | "addValue"
	valueOverride *shimast.Node
	signatures    []signature
	hasSignatures bool
}

// serviceTokenShape classifies a service token against the open-generics grammar.
type serviceTokenShape struct {
	holes map[int]bool
	mixed bool
}

// lowerStatement lowers an expression statement containing registration chains,
// carrying each derived signature inline. Returns nil when the statement is not
// a registration.
func (c *context) lowerStatement(statement *shimast.Node) []*shimast.Node {
	if statement.Kind != shimast.KindExpressionStatement {
		return nil
	}
	expr := statement.AsExpressionStatement().Expression
	registrations := c.findRegistrationCalls(expr)
	if len(registrations) == 0 {
		return nil
	}

	plans := map[*shimast.Node]*regPlan{}
	for _, reg := range registrations {
		token, hasToken := c.tokenForReg(reg)
		if reg.method == "addValue" {
			if hasToken && tokentext.IsOpenToken(token) {
				c.emitOpenTokenError(token, "addValue", reg)
			}
			plans[reg.call] = &regPlan{token: token, hasToken: hasToken, calleeMethod: "addValue"}
			continue
		}
		shape := classifyServiceToken(token, hasToken)
		if shape.mixed {
			c.emitError(regAnchor(reg), codeMixedServiceTokenArgs,
				"open service token \""+token+"\" mixes holes and concrete type args — "+
					"every type arg of an open service token must be a hole "+
					"(`IFoo<$<1>,$<2>>`); close the token fully or open it fully")
		}
		plans[reg.call] = c.planAddRegistration(reg, token, hasToken, shape)
	}

	lowered := c.lowerRegistrationExpression(expr, plans)
	return []*shimast.Node{c.factory.NewExpressionStatement(lowered)}
}

func regAnchor(reg foundReg) *shimast.Node {
	if reg.typeArg != nil {
		return reg.typeArg
	}
	return reg.call
}

// registrationMethod returns the registration method a call invokes, or ok=false.
func registrationMethod(call *shimast.Node) (string, bool) {
	callee := call.AsCallExpression().Expression
	if callee.Kind != shimast.KindPropertyAccessExpression {
		return "", false
	}
	typeArgs := call.AsCallExpression().TypeArguments
	if typeArgs != nil && len(typeArgs.Nodes) > 1 {
		return "", false
	}
	name := callee.Name().Text()
	argCount := len(callArguments(call))

	if name == "addFactory" {
		if argCount == 1 {
			return "addFactory", true
		}
		return "", false
	}
	if name != "add" && name != "addValue" {
		return "", false
	}
	if name == "addValue" {
		if argCount == 1 {
			return "addValue", true
		}
		return "", false
	}
	if argCount == 1 {
		return "add", true
	}
	if argCount == 2 {
		if typeArgs == nil || len(typeArgs.Nodes) == 0 {
			return "", false
		}
		return "add", true
	}
	return "", false
}

func callArguments(call *shimast.Node) []*shimast.Node {
	args := call.AsCallExpression().Arguments
	if args == nil {
		return nil
	}
	return args.Nodes
}

func callTypeArgs(call *shimast.Node) []*shimast.Node {
	typeArgs := call.AsCallExpression().TypeArguments
	if typeArgs == nil {
		return nil
	}
	return typeArgs.Nodes
}

// findRegistrationCalls collects every registration call reachable within expr.
func (c *context) findRegistrationCalls(expr *shimast.Node) []foundReg {
	var found []foundReg
	var walk func(node *shimast.Node)
	walk = func(node *shimast.Node) {
		if node == nil {
			return
		}
		if node.Kind == shimast.KindCallExpression {
			if method, ok := registrationMethod(node); ok {
				args := callArguments(node)
				typeArgs := callTypeArgs(node)
				reg := foundReg{call: node, method: method}
				if len(typeArgs) != 0 {
					reg.typeArg = typeArgs[0]
				}
				if len(args) != 0 {
					reg.arg = args[0]
				}
				if len(args) >= 2 {
					reg.overrideArg = args[1]
				}
				found = append(found, reg)
			}
		}
		node.ForEachChild(func(child *shimast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(expr)
	return found
}

func isAsCall(call *shimast.Node) bool {
	callee := call.AsCallExpression().Expression
	if callee.Kind != shimast.KindPropertyAccessExpression {
		return false
	}
	if callee.Name().Text() != "as" {
		return false
	}
	return len(callTypeArgs(call)) == 1
}

func isFactoryArg(arg *shimast.Node) bool {
	return arg.Kind == shimast.KindArrowFunction || arg.Kind == shimast.KindFunctionExpression
}

// tokenForReg derives the token for a registration — the explicit `<I>` type
// argument, or the type the matched overload infers for a no-type-arg call.
func (c *context) tokenForReg(reg foundReg) (string, bool) {
	var t = c.inferredRegType(reg)
	if reg.typeArg != nil {
		t = c.checker.GetTypeFromTypeNode(reg.typeArg)
	}
	if t == nil {
		return "", false
	}
	return tokens.DeriveTokenF(c.tokens, t, nil)
}

func (c *context) inferredRegType(reg foundReg) *shimchecker.Type {
	t := c.checker.GetTypeAtLocation(reg.arg)
	if reg.method == "addValue" {
		return t
	}
	if ctorSigs := c.constructSignatures(t); len(ctorSigs) != 0 {
		return c.checker.GetReturnTypeOfSignature(ctorSigs[0])
	}
	if callSigs := c.callSignatures(t); len(callSigs) != 0 {
		return c.checker.GetReturnTypeOfSignature(callSigs[0])
	}
	return t
}

// classifyServiceToken classifies a derived service token against the open-
// template grammar.
func classifyServiceToken(token string, hasToken bool) serviceTokenShape {
	holes := map[int]bool{}
	if !hasToken {
		return serviceTokenShape{holes: holes}
	}
	parsed, ok := tokentext.ParseToken(token)
	if !ok {
		return serviceTokenShape{holes: holes}
	}
	sawConcrete := false
	sawHole := false
	for _, arg := range parsed.Args {
		if n, isHole := holeNodeNumber(arg); isHole {
			holes[n] = true
			sawHole = true
		} else {
			sawConcrete = true
			if tokentext.IsOpenToken(arg) {
				sawHole = true
			}
		}
	}
	return serviceTokenShape{holes: holes, mixed: sawHole && sawConcrete}
}

// holeNodeNumber parses a bare hole node `$N` (decimal N >= 1), or ok=false.
func holeNodeNumber(token string) (int, bool) {
	if len(token) < 2 || token[0] != '$' || token[1] < '1' || token[1] > '9' {
		return 0, false
	}
	n := 0
	for i := 1; i < len(token); i++ {
		if token[i] < '0' || token[i] > '9' {
			return 0, false
		}
		n = n*10 + int(token[i]-'0')
	}
	return n, true
}

// tokenHoles yields every hole number at any depth of a token.
func tokenHoles(token string, out map[int]bool) {
	if n, ok := holeNodeNumber(token); ok {
		out[n] = true
		return
	}
	parsed, ok := tokentext.ParseToken(token)
	if !ok {
		return
	}
	for _, arg := range parsed.Args {
		tokenHoles(arg, out)
	}
}

// slotHoles yields every hole a dep slot references (recursive over unions).
func slotHoles(slot Slot, out map[int]bool) {
	switch s := slot.(type) {
	case tokenSlot:
		tokenHoles(string(s), out)
	case typeArgSlot:
		out[s.typeArg] = true
	case factorySlot:
		tokenHoles(s.typ, out)
		for _, p := range s.params {
			tokenHoles(p, out)
		}
	case unionSlot:
		for _, m := range s.members {
			slotHoles(m, out)
		}
	}
}

// checkDepHoles verifies every hole a dep signature references is bound by the
// service template (990010).
func (c *context) checkDepHoles(signatures []signature, token string, hasToken bool, shape serviceTokenShape, anchor *shimast.Node) {
	if shape.mixed {
		return
	}
	orphans := map[int]bool{}
	for _, sig := range signatures {
		for _, slot := range sig {
			holes := map[int]bool{}
			slotHoles(slot, holes)
			for n := range holes {
				if !shape.holes[n] {
					orphans[n] = true
				}
			}
		}
	}
	if len(orphans) == 0 {
		return
	}
	list := sortedHoleList(orphans)
	c.emitError(anchor, codeDepHoleNotInServiceTemplate,
		"dependency hole(s) "+list+" are not bound by the service token \""+token+
			"\" — every hole a dependency references must appear in the service token's type arguments")
}

func sortedHoleList(holes map[int]bool) string {
	nums := make([]int, 0, len(holes))
	for n := range holes {
		nums = append(nums, n)
	}
	sort.Ints(nums)
	out := ""
	for i, n := range nums {
		if i != 0 {
			out += ", "
		}
		out += "$" + itoa(n)
	}
	return out
}

// emitOpenTokenError emits 990009: an open template token on a value/factory.
func (c *context) emitOpenTokenError(token, method string, reg foundReg) {
	c.emitError(regAnchor(reg), codeOpenTokenOnValueOrFactory,
		"open template token \""+token+"\" on "+method+" — open registrations are "+
			"class registrations only; register a class implementation or close the token")
}

// planAddRegistration plans an add / addFactory registration.
func (c *context) planAddRegistration(reg foundReg, token string, hasToken bool, shape serviceTokenShape) *regPlan {
	arg := reg.arg
	openToken := hasToken && tokentext.IsOpenToken(token)

	if reg.method == "addFactory" {
		if openToken {
			c.emitOpenTokenError(token, "addFactory", reg)
		}
		var signatures []signature
		var ok bool
		if isFactoryArg(arg) {
			signatures = c.extractSignatureFromFunction(arg)
			ok = true
		} else {
			signatures, ok = c.extractFactoryReferenceSignature(arg)
		}
		if ok {
			c.checkDepHoles(signatures, token, hasToken, shape, arg)
		}
		return &regPlan{token: token, hasToken: hasToken, calleeMethod: "addFactory", signatures: signatures, hasSignatures: ok}
	}

	if isFactoryArg(arg) {
		if openToken {
			c.emitOpenTokenError(token, "addFactory", reg)
		}
		signatures := c.extractSignatureFromFunction(arg)
		c.checkDepHoles(signatures, token, hasToken, shape, arg)
		return &regPlan{token: token, hasToken: hasToken, calleeMethod: "addFactory", signatures: signatures, hasSignatures: true}
	}

	if arg.Kind == shimast.KindExpressionWithTypeArguments {
		if signatures, ok := c.extractInstantiatedSignature(arg); ok {
			c.checkDepHoles(signatures, token, hasToken, shape, arg)
			return &regPlan{
				token:         token,
				hasToken:      hasToken,
				calleeMethod:  "add",
				valueOverride: arg.AsExpressionWithTypeArguments().Expression,
				signatures:    signatures,
				hasSignatures: true,
			}
		}
	}

	t := c.checker.GetTypeAtLocation(arg)

	if len(c.constructSignatures(t)) != 0 {
		var signatures []signature
		var ok bool
		if extraction, extracted := c.extractFromExpression(arg); extracted {
			signatures = c.classSignatureFromExtraction(extraction)
			ok = true
		} else {
			signatures, ok = c.extractCtorReferenceSignature(arg)
		}
		if ok && reg.overrideArg != nil {
			merged := make([]signature, 0, len(signatures))
			for _, sig := range signatures {
				merged = append(merged, c.applyOverrides(sig, reg.overrideArg))
			}
			signatures = merged
		}
		if ok {
			c.checkDepHoles(signatures, token, hasToken, shape, arg)
		}
		return &regPlan{token: token, hasToken: hasToken, calleeMethod: "add", signatures: signatures, hasSignatures: ok}
	}

	if len(c.callSignatures(t)) != 0 {
		if openToken {
			c.emitOpenTokenError(token, "addFactory", reg)
		}
		signatures, ok := c.extractFactoryReferenceSignature(arg)
		if ok {
			c.checkDepHoles(signatures, token, hasToken, shape, arg)
		}
		return &regPlan{token: token, hasToken: hasToken, calleeMethod: "addFactory", signatures: signatures, hasSignatures: ok}
	}

	return &regPlan{token: token, hasToken: hasToken, calleeMethod: "add"}
}

// classSignatureFromExtraction returns the class signatures and runs the §4.5
// factory-param check.
func (c *context) classSignatureFromExtraction(extraction *constructorExtraction) []signature {
	c.checkExtractedRegistration(extraction)
	return extraction.signatures
}

// applyOverrides merges a registration-time override array over a base signature.
func (c *context) applyOverrides(base signature, overrideNode *shimast.Node) signature {
	if overrideNode.Kind != shimast.KindArrayLiteralExpression {
		return base
	}
	result := make(signature, len(base))
	copy(result, base)
	elements := overrideNode.AsArrayLiteralExpression().Elements.Nodes
	for i, elem := range elements {
		if elem.Kind == shimast.KindOmittedExpression {
			continue
		}
		if elem.Kind == shimast.KindIdentifier && elem.Text() == "undefined" {
			continue
		}
		if elem.Kind == shimast.KindStringLiteral {
			if i < len(result) {
				result[i] = tokenSlot(elem.Text())
			}
			continue
		}
		c.emitWarning(elem, codeUnresolvableOverrideElement,
			"override element at position "+itoa(i)+" is not a string-literal token; the "+
				"transformer cannot resolve it statically, so the derived token is "+
				"kept. Use a string-literal token (or `undefined` to keep the derived token).")
	}
	return result
}

// lowerRegistrationExpression rewrites each planned call and every `.as<"x">()`.
func (c *context) lowerRegistrationExpression(expr *shimast.Node, plans map[*shimast.Node]*regPlan) *shimast.Node {
	var visitor *shimast.NodeVisitor
	visit := func(node *shimast.Node) *shimast.Node {
		if node == nil {
			return nil
		}
		if node.Kind == shimast.KindCallExpression {
			if plan, ok := plans[node]; ok {
				return c.lowerRegistrationCall(node, plan)
			}
		}
		visited := visitor.VisitEachChild(node)
		if visited.Kind == shimast.KindCallExpression && isAsCall(visited) {
			return c.lowerAsCall(visited)
		}
		return visited
	}
	visitor = c.ec.NewNodeVisitor(visit)
	return visitor.VisitNode(expr)
}

// lowerRegistrationCall rewrites a single registration call per its plan.
func (c *context) lowerRegistrationCall(call *shimast.Node, plan *regPlan) *shimast.Node {
	var tokenLit *shimast.Node
	if plan.hasToken {
		tokenLit = c.stringLit(plan.token)
	} else {
		tokenLit = c.factory.NewKeywordExpression(shimast.KindNullKeyword)
	}
	calleeNode := call.AsCallExpression().Expression
	valueArg := plan.valueOverride
	if valueArg == nil {
		valueArg = callArguments(call)[0]
	}
	args := []*shimast.Node{tokenLit, valueArg}
	if plan.hasSignatures {
		args = append(args, c.signaturesLiteral(plan.signatures))
	}

	var newCallee *shimast.Node
	if calleeNode.Name().Text() == plan.calleeMethod {
		newCallee = calleeNode
	} else {
		object := calleeNode.AsPropertyAccessExpression().Expression
		newCallee = c.factory.NewPropertyAccessExpression(object, nil, c.factory.NewIdentifier(plan.calleeMethod), 0)
	}
	return c.factory.NewCallExpression(newCallee, nil, nil, c.factory.NewNodeList(args), 0)
}

// lowerAsCall rewrites `.as<"x">()` to `.as("x")`.
func (c *context) lowerAsCall(call *shimast.Node) *shimast.Node {
	typeArg := callTypeArgs(call)[0]
	existing := callArguments(call)
	if typeArg.Kind == shimast.KindLiteralType {
		literal := typeArg.AsLiteralTypeNode().Literal
		if literal.Kind == shimast.KindStringLiteral {
			args := append([]*shimast.Node{c.stringLit(literal.Text())}, existing...)
			return c.factory.NewCallExpression(call.AsCallExpression().Expression, nil, nil, c.factory.NewNodeList(args), 0)
		}
	}
	return c.factory.NewCallExpression(call.AsCallExpression().Expression, nil, nil, c.factory.NewNodeList(existing), 0)
}

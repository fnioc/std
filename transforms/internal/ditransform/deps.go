package ditransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokens"
)

// typeArgTokenName is the `Typeof<T>` brand alias — matched by alias/symbol name.
const typeArgTokenName = "Typeof"

const unresolvableSentinel = "??unresolvable??"

// ── low-level type / AST helpers ─────────────────────────────────────────────

func (c *context) constructSignatures(t *shimchecker.Type) []*shimchecker.Signature {
	return shimchecker.Checker_getSignaturesOfType(c.checker, t, shimchecker.SignatureKindConstruct)
}

func (c *context) callSignatures(t *shimchecker.Type) []*shimchecker.Signature {
	return shimchecker.Checker_getSignaturesOfType(c.checker, t, shimchecker.SignatureKindCall)
}

func isUnion(t *shimchecker.Type) bool {
	return t.Flags()&shimchecker.TypeFlagsUnion != 0
}

func typeIncludesUndefinedOrVoid(t *shimchecker.Type) bool {
	nullish := shimchecker.TypeFlagsUndefined | shimchecker.TypeFlagsVoid
	if t.Flags()&nullish != 0 {
		return true
	}
	if isUnion(t) {
		for _, m := range t.Types() {
			if m.Flags()&nullish != 0 {
				return true
			}
		}
	}
	return false
}

// isMultiMemberUnion reports a union with two or more non-nullish members — a
// real union of alternatives, as opposed to a one-member-plus-undefined optional.
func isMultiMemberUnion(t *shimchecker.Type) bool {
	if !isUnion(t) {
		return false
	}
	nullish := shimchecker.TypeFlagsUndefined | shimchecker.TypeFlagsNull | shimchecker.TypeFlagsVoid
	count := 0
	for _, m := range t.Types() {
		if m.Flags()&nullish == 0 {
			count++
		}
	}
	return count >= 2
}

// nonNullish strips undefined/null/void from a union, returning the sole
// survivor when exactly one remains, else the type unchanged.
func nonNullish(t *shimchecker.Type) *shimchecker.Type {
	if !isUnion(t) {
		return t
	}
	nullish := shimchecker.TypeFlagsUndefined | shimchecker.TypeFlagsNull | shimchecker.TypeFlagsVoid
	kept := make([]*shimchecker.Type, 0, len(t.Types()))
	for _, m := range t.Types() {
		if m.Flags()&nullish == 0 {
			kept = append(kept, m)
		}
	}
	if len(kept) == 1 {
		return kept[0]
	}
	return t
}

func (c *context) paramType(param *shimast.Node) *shimchecker.Type {
	return c.checker.GetTypeAtLocation(param)
}

func paramTypeNode(param *shimast.Node) *shimast.Node {
	return param.AsParameterDeclaration().Type
}

func paramIsRest(param *shimast.Node) bool {
	return param.AsParameterDeclaration().DotDotDotToken != nil
}

func paramIsOptionalSyntactic(param *shimast.Node) bool {
	decl := param.AsParameterDeclaration()
	return decl.QuestionToken != nil || decl.Initializer != nil
}

// ── brand / typeof helpers (bridged to the shared token core) ────────────────

// typeArgSlotFor returns a `Typeof<T>` slot: an open `{ typeArg: N }` for a hole
// binding, or a closed `{ value: "<token>" }` for a concrete one, or nil when
// the type is not a `Typeof` reference. An underivable binding is a hard error.
func (c *context) typeArgSlotFor(t *shimchecker.Type, param *shimast.Node) (Slot, bool) {
	name := tokens.AliasSymbolName(t)
	if name == "" {
		name = tokens.SymbolName(t)
	}
	if name != typeArgTokenName {
		return nil, false
	}
	args := tokens.AliasTypeArguments(t)
	if len(args) == 0 {
		return nil, false
	}
	binding := args[0]
	if hole, ok := tokens.HoleNumberFor(binding, c.checker); ok {
		return typeArgSlot{typeArg: hole}, true
	}
	var failure tokens.Failure
	if token, ok := tokens.DeriveTokenF(c.tokens, binding, &failure); ok {
		return literalSlot{value: tokens.LiteralValue{Kind: tokens.LiteralString, Str: token}}, true
	}
	anchor := paramTypeNodeOr(param)
	if failure.UnboundTypeParameter != nil {
		c.emitError(anchor, codeUnboundTypeParameter,
			"the Typeof binding references an unbound type parameter — register "+
				"the class via an instantiation expression that binds it (`Foo<$<1>>` or "+
				"`Foo<Concrete>`)")
	} else {
		c.emitError(anchor, codeUnderivableToken,
			"cannot derive a token for this Typeof binding — name the type")
	}
	return tokenSlot(unresolvableSentinel), true
}

func paramTypeNodeOr(param *shimast.Node) *shimast.Node {
	if tn := paramTypeNode(param); tn != nil {
		return tn
	}
	return param
}

// ── class constructor extraction ─────────────────────────────────────────────

// constructorExtraction pairs a class symbol with its extracted signatures.
type constructorExtraction struct {
	classSymbol *shimast.Symbol
	signatures  []signature
}

// extractFromExpression resolves the class a registration arg refers to and
// extracts its constructor signature, or ok=false for a non-class expression.
//
// This is a checker-anchored matcher (GetSymbolAtLocation), so it carries the same
// clean-skip guard the primitive stages do: under the fixed-point loop a value
// argument handed to the shared extractor is always the ORIGINAL program-bound
// node (the inline stage captures and re-splices it), but a rebuilt property access
// can carry a real position with an unset Parent, and the checker's
// GetSymbolAtLocation derefs `Parent.Parent` unconditionally — so a negative
// position or nil Parent is a clean "not a class" skip, never a nil-deref.
func (c *context) extractFromExpression(expr *shimast.Node) (*constructorExtraction, bool) {
	if expr.Pos() < 0 || expr.Parent == nil {
		return nil, false
	}
	symbol := c.checker.GetSymbolAtLocation(expr)
	if symbol == nil {
		return nil, false
	}
	resolved := aliasTarget(c.checker, symbol)
	classDecl := classDeclarationOf(resolved)
	if classDecl == nil {
		return nil, false
	}
	return &constructorExtraction{classSymbol: resolved, signatures: c.extractSignatureFromClass(classDecl)}, true
}

func aliasTarget(checker *shimchecker.Checker, symbol *shimast.Symbol) *shimast.Symbol {
	if symbol.Flags&shimast.SymbolFlagsAlias != 0 {
		if aliased := checker.GetAliasedSymbol(symbol); aliased != nil {
			return aliased
		}
	}
	return symbol
}

func classDeclarationOf(symbol *shimast.Symbol) *shimast.Node {
	if symbol == nil {
		return nil
	}
	for _, d := range symbol.Declarations {
		if d.Kind == shimast.KindClassDeclaration {
			return d
		}
	}
	return nil
}

func classDeclarationOfType(t *shimchecker.Type) *shimast.Node {
	// Prefer the alias symbol, then the underlying symbol, mirroring
	// `type.aliasSymbol ?? type.getSymbol()`.
	symbol := tokens.AliasSymbol(t)
	if symbol == nil {
		symbol = t.Symbol()
	}
	if symbol == nil {
		return nil
	}
	return classDeclFromSymbol(symbol)
}

func classDeclFromSymbol(symbol *shimast.Symbol) *shimast.Node {
	for _, d := range symbol.Declarations {
		if d.Kind == shimast.KindClassDeclaration {
			return d
		}
	}
	return nil
}

// constructorDeclarations returns the constructor member declarations of a class.
func constructorDeclarations(classDecl *shimast.Node) []*shimast.Node {
	ctors := make([]*shimast.Node, 0, 1)
	for _, m := range classDecl.Members() {
		if m.Kind == shimast.KindConstructor {
			ctors = append(ctors, m)
		}
	}
	return ctors
}

func ctorParameters(ctor *shimast.Node) []*shimast.Node {
	return ctor.Parameters()
}

func ctorHasBody(ctor *shimast.Node) bool {
	return ctor.Body() != nil
}

// extractSignatureFromClass extracts the constructor signatures: declared
// overloads (bodyless) win one signature each; otherwise the implementation
// drives a single signature; no constructor yields one empty signature.
func (c *context) extractSignatureFromClass(classDecl *shimast.Node) []signature {
	ctors := constructorDeclarations(classDecl)
	if len(ctors) == 0 {
		return []signature{{}}
	}
	overloads := make([]*shimast.Node, 0, len(ctors))
	for _, ctor := range ctors {
		if !ctorHasBody(ctor) {
			overloads = append(overloads, ctor)
		}
	}
	if len(overloads) != 0 {
		out := make([]signature, 0, len(overloads))
		for _, ctor := range overloads {
			slots := make(signature, 0)
			for _, p := range ctorParameters(ctor) {
				slots = append(slots, c.extractParamSlot(p, nil))
			}
			out = append(out, slots)
		}
		return out
	}
	return c.paramsToSignatures(ctorParameters(ctors[0]), false)
}

// findConstructor returns the implementation constructor (with a body), else the
// first — the real construction shape for the §4.5 check.
func findConstructor(classDecl *shimast.Node) *shimast.Node {
	ctors := constructorDeclarations(classDecl)
	for _, ctor := range ctors {
		if ctorHasBody(ctor) {
			return ctor
		}
	}
	if len(ctors) != 0 {
		return ctors[0]
	}
	return nil
}

// paramsToSignatures maps a parameter list to its emitted signatures. A non-rest
// list yields one signature (one slot per param). A trailing rest is expanded
// positionally when it is a tuple or union-of-tuples (one signature per member
// tuple); an inexpressible rest keeps a single opaque slot.
func (c *context) paramsToSignatures(params []*shimast.Node, _ bool) []signature {
	restIndex := -1
	for i, p := range params {
		if paramIsRest(p) {
			restIndex = i
			break
		}
	}
	if restIndex == -1 {
		slots := make(signature, 0, len(params))
		for _, p := range params {
			slots = append(slots, c.extractParamSlot(p, nil))
		}
		return []signature{slots}
	}
	expanded := c.expandRestParam(params[restIndex])
	if expanded == nil {
		slots := make(signature, 0, len(params))
		for _, p := range params {
			slots = append(slots, c.extractParamSlot(p, nil))
		}
		return []signature{slots}
	}
	fixed := make(signature, 0, restIndex)
	for _, p := range params[:restIndex] {
		fixed = append(fixed, c.extractParamSlot(p, nil))
	}
	out := make([]signature, 0, len(expanded))
	for _, tail := range expanded {
		sig := make(signature, 0, len(fixed)+len(tail))
		sig = append(sig, fixed...)
		sig = append(sig, tail...)
		out = append(out, sig)
	}
	return out
}

// expandRestParam expands a rest parameter into one-or-more slot tails: a tuple
// rest yields one tail, a union-of-tuples rest one tail per member, else nil.
//
// The per-element optionality flags of a tuple are unexported behind the ttsc
// shim (a known gap), so element optionality is approximated by whether the
// element type admits undefined/void; overloaded-constructor tuples (all
// required members) are unaffected.
func (c *context) expandRestParam(rest *shimast.Node) [][]Slot {
	t := c.paramType(rest)
	if isUnion(t) {
		tails := make([][]Slot, 0, len(t.Types()))
		for _, member := range t.Types() {
			tail, ok := c.tupleElementSlots(member, rest)
			if !ok {
				return nil
			}
			tails = append(tails, tail)
		}
		if len(tails) == 0 {
			return nil
		}
		return tails
	}
	tail, ok := c.tupleElementSlots(t, rest)
	if !ok {
		return nil
	}
	return [][]Slot{tail}
}

// tupleElementSlots returns the positional slots for a tuple type — one per
// element type — or ok=false when the type is not a tuple.
func (c *context) tupleElementSlots(t *shimchecker.Type, anchor *shimast.Node) ([]Slot, bool) {
	if !shimchecker.IsTupleType(t) {
		return nil, false
	}
	elements := c.checker.GetTypeArguments(t)
	slots := make([]Slot, 0, len(elements))
	for _, elem := range elements {
		slots = append(slots, c.slotForType(elem, typeIncludesUndefinedOrVoid(elem), anchor))
	}
	return slots, true
}

// ── per-parameter classification ─────────────────────────────────────────────

// extractParamSlot classifies one constructor parameter into a slot. typeOverride
// supplies the instantiated (substituted) type for a generic-impl registration;
// the declaration node still drives syntactic classification.
func (c *context) extractParamSlot(param *shimast.Node, typeOverride *shimchecker.Type) Slot {
	rawType := typeOverride
	if rawType == nil {
		rawType = c.paramType(param)
	}

	// 1. Typeof<T> → type-arg slot (hole) or closed token.
	if slot, ok := c.typeArgSlotFor(rawType, param); ok {
		return slot
	}

	// 2. Inject brand on the whole single non-union param type.
	if !c.isOptionalParam(param, typeOverride) && !isMultiMemberUnion(rawType) {
		// A `Keyed<T, "k">` param composes the derived base with a `#k` suffix. It
		// must run BEFORE the bare InjectTokenFor below: `Keyed<Inject<T, "tok">,
		// "k">` stacks both brands, and KeyedTokenFor reads the Inject base itself
		// — the bare check would return `tok` and drop the `#k` suffix.
		if token, ok := tokens.KeyedTokenFor(c.tokens, rawType); ok {
			return tokenSlot(token)
		}
		if token, ok := tokens.InjectTokenFor(rawType, c.checker); ok {
			return tokenSlot(token)
		}
	}

	// Optional in any form: non-nullish slots first, `{ value: undefined }` last.
	if c.isOptionalParam(param, typeOverride) {
		members := c.nonNullishMemberSlots(param, typeOverride)
		if len(members) == 0 {
			return literalSlot{value: tokens.LiteralValue{Kind: tokens.LiteralUndefined}}
		}
		return unionSlot{members: append(members, literalSlot{value: tokens.LiteralValue{Kind: tokens.LiteralUndefined}})}
	}

	// 3. Inline factory (syntactic FunctionTypeNode).
	if factory, ok := c.factorySlotFor(param, typeOverride); ok {
		return factory
	}

	// 4. Inline union (syntactic UnionTypeNode).
	typeNode := paramTypeNode(param)
	if typeNode != nil && typeNode.Kind == shimast.KindUnionType &&
		!tokens.IsPureLiteralUnion(rawType) &&
		rawType.Flags()&shimchecker.TypeFlagsBoolean == 0 {
		memberNodes := typeNode.AsUnionTypeNode().Types.Nodes
		if len(memberNodes) >= 2 && c.overrideMatchesSyntacticUnion(typeOverride, len(memberNodes)) {
			overrides := c.unionMemberOverrides(typeOverride, len(memberNodes), false)
			members := make([]Slot, 0, len(memberNodes))
			for i, mn := range memberNodes {
				members = append(members, c.extractParamSlotFromTypeNode(mn, param, overrides[i]))
			}
			return unionSlot{members: members}
		}
	}

	// 5. Normal derivation. Rule-2 singleton first.
	if singleton, ok := tokens.SingletonValue(rawType); ok {
		return literalSlot{value: singleton}
	}
	var failure tokens.Failure
	if token, ok := tokens.TokenForType(c.tokens, rawType, &failure); ok {
		return tokenSlot(token)
	}

	// 6. Hard error.
	anchor := paramTypeNodeOr(param)
	if failure.UnboundTypeParameter != nil {
		c.emitError(anchor, codeUnboundTypeParameter,
			"this parameter references an unbound type parameter — register the class "+
				"via an instantiation expression that binds it (`addClass<IFoo<$<1>>>(Foo<$<1>>)` "+
				"for an open template, or `Foo<Concrete>` for a closed one)")
	} else {
		c.emitError(anchor, codeUnderivableToken,
			"cannot derive a token for this type — name the type or brand the parameter with `Inject<T, 'my:token'>`")
	}
	return tokenSlot(unresolvableSentinel)
}

func (c *context) isOptionalParam(param *shimast.Node, typeOverride *shimchecker.Type) bool {
	if paramIsOptionalSyntactic(param) {
		return true
	}
	t := typeOverride
	if t == nil {
		t = c.paramType(param)
	}
	return typeIncludesUndefinedOrVoid(t)
}

// overrideMatchesSyntacticUnion reports whether per-member union pairing is safe.
func (c *context) overrideMatchesSyntacticUnion(override *shimchecker.Type, memberCount int) bool {
	if override == nil {
		return true
	}
	return isUnion(override) && len(override.Types()) == memberCount
}

// unionMemberOverrides positionally pairs an instantiated union override with a
// syntactic union node's members, one override (or nil) per member.
func (c *context) unionMemberOverrides(override *shimchecker.Type, memberCount int, stripUndefinedAndVoid bool) []*shimchecker.Type {
	none := make([]*shimchecker.Type, memberCount)
	if override == nil || !isUnion(override) {
		return none
	}
	members := override.Types()
	if stripUndefinedAndVoid {
		filtered := make([]*shimchecker.Type, 0, len(members))
		for _, m := range members {
			if m.Flags()&(shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsVoid) == 0 {
				filtered = append(filtered, m)
			}
		}
		members = filtered
	}
	if len(members) == memberCount {
		return members
	}
	return none
}

// nonNullishMemberSlots returns the slot(s) for the non-undefined/void part of an
// optional param — the members preceding the `{ value: undefined }` fallback.
func (c *context) nonNullishMemberSlots(param *shimast.Node, typeOverride *shimchecker.Type) []Slot {
	rawType := typeOverride
	if rawType == nil {
		rawType = c.paramType(param)
	}

	if literalUnion, ok := tokens.LiteralUnionTokenForOptional(rawType); ok {
		return []Slot{tokenSlot(literalUnion)}
	}

	core := nonNullish(rawType)
	typeNode := paramTypeNode(param)
	if typeNode != nil && typeNode.Kind == shimast.KindUnionType {
		memberNodes := typeNode.AsUnionTypeNode().Types.Nodes
		kept := make([]*shimast.Node, 0, len(memberNodes))
		for _, mn := range memberNodes {
			if mn.Kind != shimast.KindUndefinedKeyword && mn.Kind != shimast.KindVoidKeyword {
				kept = append(kept, mn)
			}
		}
		if len(kept) != 0 {
			allBoolean := true
			for _, mn := range kept {
				if c.checker.GetTypeFromTypeNode(mn).Flags()&shimchecker.TypeFlagsBooleanLiteral == 0 {
					allBoolean = false
					break
				}
			}
			if allBoolean {
				return []Slot{tokenSlot("boolean")}
			}
			overrides := c.unionMemberOverrides(typeOverride, len(kept), true)
			slots := make([]Slot, 0, len(kept))
			for i, mn := range kept {
				slots = append(slots, c.extractParamSlotFromTypeNode(mn, param, overrides[i]))
			}
			return slots
		}
	}

	if core.Flags()&(shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsVoid) != 0 {
		return nil
	}
	if token, ok := tokens.InjectTokenFor(core, c.checker); ok {
		return []Slot{tokenSlot(token)}
	}
	if slot, ok := c.typeArgSlotFor(core, param); ok {
		return []Slot{slot}
	}
	if singleton, ok := tokens.SingletonValue(core); ok {
		return []Slot{literalSlot{value: singleton}}
	}
	if core == rawType && typeNode != nil && typeNode.Kind != shimast.KindUnionType {
		nodeType := c.checker.GetTypeFromTypeNode(typeNode)
		if token, ok := tokens.TokenForType(c.tokens, nodeType, nil); ok {
			return []Slot{tokenSlot(token)}
		}
	}
	if token, ok := tokens.TokenForType(c.tokens, core, nil); ok {
		return []Slot{tokenSlot(token)}
	}
	return nil
}

// extractParamSlotFromTypeNode lowers one inline-union member type node into a
// slot, reusing the parent parameter's context.
func (c *context) extractParamSlotFromTypeNode(typeNode *shimast.Node, parentParam *shimast.Node, memberOverride *shimchecker.Type) Slot {
	memberType := memberOverride
	if memberType == nil {
		memberType = c.checker.GetTypeFromTypeNode(typeNode)
	}
	if token, ok := tokens.InjectTokenFor(memberType, c.checker); ok {
		return tokenSlot(token)
	}
	if slot, ok := c.typeArgSlotFor(memberType, parentParam); ok {
		return slot
	}
	if typeNode.Kind == shimast.KindFunctionType {
		sig := c.signatureOfFunctionTypeNode(typeNode)
		if sig != nil {
			if token, ok := tokens.TokenForReturnType(c.tokens, sig); ok {
				return factorySlot{typ: token}
			}
		}
	}
	if typeNode.Kind == shimast.KindUnionType {
		memberNodes := typeNode.AsUnionTypeNode().Types.Nodes
		nonUndef := make([]*shimast.Node, 0, len(memberNodes))
		for _, mn := range memberNodes {
			if mn.Kind != shimast.KindUndefinedKeyword {
				nonUndef = append(nonUndef, mn)
			}
		}
		if len(nonUndef) >= 2 {
			members := make([]Slot, 0, len(nonUndef))
			for _, mn := range nonUndef {
				members = append(members, c.extractParamSlotFromTypeNode(mn, parentParam, nil))
			}
			return unionSlot{members: members}
		}
		if len(nonUndef) == 1 {
			return c.extractParamSlotFromTypeNode(nonUndef[0], parentParam, nil)
		}
	}
	if singleton, ok := tokens.SingletonValue(memberType); ok {
		return literalSlot{value: singleton}
	}
	if token, ok := tokens.TokenForType(c.tokens, memberType, nil); ok {
		return tokenSlot(token)
	}
	c.emitError(typeNode, codeUnderivableToken,
		"cannot derive a token for this type — name the type or brand the parameter with `Inject<T, 'my:token'>`")
	return tokenSlot(unresolvableSentinel)
}

// slotForType classifies a bare type (a computed tuple element) into a slot,
// mirroring extractParamSlot's priority order over a type rather than a node.
func (c *context) slotForType(t *shimchecker.Type, optional bool, anchor *shimast.Node) Slot {
	if slot, ok := c.typeArgSlotFor(t, anchor); ok {
		return slot
	}
	if optional || typeIncludesUndefinedOrVoid(t) {
		members := c.nonNullishTypeSlots(t, anchor)
		if len(members) == 0 {
			return literalSlot{value: tokens.LiteralValue{Kind: tokens.LiteralUndefined}}
		}
		return unionSlot{members: append(members, literalSlot{value: tokens.LiteralValue{Kind: tokens.LiteralUndefined}})}
	}
	if !isMultiMemberUnion(t) {
		if token, ok := tokens.InjectTokenFor(t, c.checker); ok {
			return tokenSlot(token)
		}
	}
	if factory, ok := c.factorySlotForType(t); ok {
		return factory
	}
	if isAnonymousUnion(t) && !tokens.IsPureLiteralUnion(t) && t.Flags()&shimchecker.TypeFlagsBoolean == 0 {
		members := make([]Slot, 0, len(t.Types()))
		for _, m := range t.Types() {
			members = append(members, c.slotForType(m, false, anchor))
		}
		return unionSlot{members: members}
	}
	if singleton, ok := tokens.SingletonValue(t); ok {
		return literalSlot{value: singleton}
	}
	if token, ok := tokens.TokenForType(c.tokens, t, nil); ok {
		return tokenSlot(token)
	}
	c.emitError(anchor, codeUnderivableToken,
		"cannot derive a token for this factory parameter type — name the type or brand the parameter with `Inject<T, 'my:token'>`")
	return tokenSlot(unresolvableSentinel)
}

func (c *context) nonNullishTypeSlots(t *shimchecker.Type, anchor *shimast.Node) []Slot {
	if literalUnion, ok := tokens.LiteralUnionTokenForOptional(t); ok {
		return []Slot{tokenSlot(literalUnion)}
	}
	if isUnion(t) {
		kept := make([]*shimchecker.Type, 0, len(t.Types()))
		for _, m := range t.Types() {
			if m.Flags()&(shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsVoid) == 0 {
				kept = append(kept, m)
			}
		}
		if len(kept) >= 2 {
			allBoolean := true
			for _, m := range kept {
				if m.Flags()&shimchecker.TypeFlagsBooleanLiteral == 0 {
					allBoolean = false
					break
				}
			}
			if allBoolean {
				return []Slot{tokenSlot("boolean")}
			}
		}
		slots := make([]Slot, 0, len(kept))
		for _, m := range kept {
			slots = append(slots, c.slotForType(m, false, anchor))
		}
		return slots
	}
	if t.Flags()&(shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsVoid) != 0 {
		return nil
	}
	return []Slot{c.slotForType(t, false, anchor)}
}

// isAnonymousUnion reports an inline union with no alias symbol.
func isAnonymousUnion(t *shimchecker.Type) bool {
	return isUnion(t) && tokens.AliasSymbolName(t) == "" && isMultiMemberUnion(t)
}

// isAnonymousType reports an anonymous object type (an inline `() => X`).
func isAnonymousType(t *shimchecker.Type) bool {
	if tokens.AliasSymbolName(t) != "" {
		return false
	}
	return t.ObjectFlags()&shimchecker.ObjectFlagsAnonymous != 0
}

// ── factory-slot extraction ──────────────────────────────────────────────────

func (c *context) signatureOfFunctionTypeNode(typeNode *shimast.Node) *shimchecker.Signature {
	t := c.checker.GetTypeFromTypeNode(typeNode)
	sigs := c.callSignatures(t)
	if len(sigs) == 0 {
		return nil
	}
	return sigs[0]
}

// factorySlotFor returns a factory slot when the param's annotation is an inline
// function-type literal, keyed on the return type's token, with a token per
// declared param. A named function-interface reference is the opt-out (nil).
func (c *context) factorySlotFor(param *shimast.Node, typeOverride *shimchecker.Type) (factorySlot, bool) {
	typeNode := paramTypeNode(param)
	if typeNode == nil || typeNode.Kind != shimast.KindFunctionType {
		return factorySlot{}, false
	}
	var sig *shimchecker.Signature
	if typeOverride != nil {
		sigs := c.callSignatures(typeOverride)
		if len(sigs) != 0 {
			sig = sigs[0]
		}
	} else {
		sig = c.signatureOfFunctionTypeNode(typeNode)
	}
	if sig == nil {
		return factorySlot{}, false
	}
	token, ok := tokens.TokenForReturnType(c.tokens, sig)
	if !ok {
		return factorySlot{}, false
	}
	fnParams := typeNode.AsFunctionTypeNode().Parameters
	if fnParams == nil || len(fnParams.Nodes) == 0 {
		return factorySlot{typ: token}, true
	}
	nodes := fnParams.Nodes
	sigParams := shimchecker.Signature_parameters(sig)
	params := make([]string, 0, len(nodes))
	for i, p := range nodes {
		var tokenText string
		var derived bool
		if typeOverride != nil && i < len(sigParams) {
			tokenText, derived = c.tokenForSymbolType(sigParams[i])
		} else {
			tokenText, derived = c.slotForParam(p)
		}
		if !derived {
			c.emitError(paramTypeNodeOr(p), codeUnderivableToken,
				"cannot derive a token for this factory parameter type — name the type so the runtime can route the caller-supplied argument")
			params = append(params, unresolvableSentinel)
		} else {
			params = append(params, tokenText)
		}
	}
	return factorySlot{typ: token, params: params}, true
}

// factorySlotForType returns a factory slot for a bare inline function type
// (callable, not constructable, anonymous), else ok=false.
func (c *context) factorySlotForType(t *shimchecker.Type) (factorySlot, bool) {
	if len(c.constructSignatures(t)) != 0 {
		return factorySlot{}, false
	}
	callSigs := c.callSignatures(t)
	if len(callSigs) == 0 {
		return factorySlot{}, false
	}
	if !isAnonymousType(t) {
		return factorySlot{}, false
	}
	sig := callSigs[0]
	token, ok := tokens.TokenForReturnType(c.tokens, sig)
	if !ok {
		return factorySlot{}, false
	}
	sigParams := shimchecker.Signature_parameters(sig)
	if len(sigParams) == 0 {
		return factorySlot{typ: token}, true
	}
	params := make([]string, 0, len(sigParams))
	for _, ps := range sigParams {
		tokenText, ok := c.tokenForSymbolType(ps)
		if !ok {
			c.emitError(c.sf.AsNode(), codeUnderivableToken,
				"cannot derive a token for this factory parameter type — name the type so the runtime can route the caller-supplied argument")
			params = append(params, unresolvableSentinel)
		} else {
			params = append(params, tokenText)
		}
	}
	return factorySlot{typ: token, params: params}, true
}

// ── reference-signature extraction (factory / ctor values) ───────────────────

// extractSignatureFromFunction extracts the parameter signature of a factory
// function literal (arrow or function expression).
func (c *context) extractSignatureFromFunction(fn *shimast.Node) []signature {
	return c.paramsToSignatures(fn.Parameters(), false)
}

// signatureToSlots maps a resolved signature's parameters to slots, or ok=false
// when a parameter cannot be read positionally (no declaration / rest).
func (c *context) signatureToSlots(sig *shimchecker.Signature) ([]signature, bool) {
	symbols := shimchecker.Signature_parameters(sig)
	params := make([]*shimast.Node, 0, len(symbols))
	for _, s := range symbols {
		decl := symbolValueDeclaration(s)
		if decl == nil || decl.Kind != shimast.KindParameter || paramIsRest(decl) {
			return nil, false
		}
		params = append(params, decl)
	}
	return c.paramsToSignatures(params, false), true
}

func (c *context) mapReferenceSignatures(sigs []*shimchecker.Signature) ([]signature, bool) {
	if len(sigs) == 0 {
		return nil, false
	}
	results := make([]signature, 0, len(sigs))
	for _, sig := range sigs {
		slots, ok := c.signatureToSlots(sig)
		if !ok {
			return nil, false
		}
		results = append(results, slots...)
	}
	if len(results) == 0 {
		return nil, false
	}
	return results, true
}

// extractFactoryReferenceSignature extracts a callable-only factory value's
// parameter signature, or ok=false when the arg is constructable / non-callable.
func (c *context) extractFactoryReferenceSignature(expr *shimast.Node) ([]signature, bool) {
	t := c.checker.GetTypeAtLocation(expr)
	if len(c.constructSignatures(t)) != 0 {
		return nil, false
	}
	return c.mapReferenceSignatures(c.callSignatures(t))
}

// extractCtorReferenceSignature extracts a constructable value's (declaration-
// less) constructor signature.
func (c *context) extractCtorReferenceSignature(expr *shimast.Node) ([]signature, bool) {
	return c.mapReferenceSignatures(c.constructSignatures(c.checker.GetTypeAtLocation(expr)))
}

// extractInstantiatedSignature extracts the constructor signatures of an
// instantiation-expression registration arg — construct signatures already
// substituted, each param paired with its declaration node for syntactic
// classification.
func (c *context) extractInstantiatedSignature(ewta *shimast.Node) ([]signature, bool) {
	t := c.checker.GetTypeAtLocation(ewta)
	ctorSigs := c.constructSignatures(t)
	if len(ctorSigs) == 0 {
		return nil, false
	}
	results := make([]signature, 0, len(ctorSigs))
	for _, sig := range ctorSigs {
		symbols := shimchecker.Signature_parameters(sig)
		slots := make(signature, 0, len(symbols))
		for _, s := range symbols {
			decl := symbolValueDeclaration(s)
			if decl == nil || decl.Kind != shimast.KindParameter || paramIsRest(decl) {
				return nil, false
			}
			slots = append(slots, c.extractParamSlot(decl, c.checker.GetTypeOfSymbol(s)))
		}
		results = append(results, slots)
	}
	return results, true
}

// symbolValueDeclaration returns a symbol's value declaration (a parameter node
// for a signature parameter symbol), preferring the first parameter declaration.
func symbolValueDeclaration(symbol *shimast.Symbol) *shimast.Node {
	if symbol == nil {
		return nil
	}
	if vd := symbol.ValueDeclaration; vd != nil {
		return vd
	}
	for _, d := range symbol.Declarations {
		if d.Kind == shimast.KindParameter {
			return d
		}
	}
	return nil
}

// slotForParam returns the token for a single parameter, or ok=false when the
// type yields no derivable token (a "hole" for the §4.5 check).
func (c *context) slotForParam(param *shimast.Node) (string, bool) {
	t := nonNullish(c.checker.GetTypeAtLocation(param))
	return tokens.TokenForType(c.tokens, t, nil)
}

// tokenForSymbolType returns the token for a parameter symbol's type (used for an
// instantiated signature's substituted param types).
func (c *context) tokenForSymbolType(symbol *shimast.Symbol) (string, bool) {
	t := nonNullish(c.checker.GetTypeOfSymbol(symbol))
	return tokens.TokenForType(c.tokens, t, nil)
}

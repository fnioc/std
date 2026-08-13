package tokens

import (
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// DerivedKind discriminates a Derived node — the two callable shapes (a
// function's call signature, a class's construct signature), a `Keyed<T, K>`
// brand, a general union's decomposed members, and the two nullish
// singletons (neither of which DeriveTypeF's literal handling covers — see
// its own doc), layered over DeriveTypeF's own named / literal / placeholder
// tree (kept, unclassified, as a Leaf).
type DerivedKind int

const (
	DerivedLeaf DerivedKind = iota
	DerivedFunc
	DerivedCtor
	DerivedTag
	DerivedUnion
	DerivedUndefined
	DerivedNull
)

// Derived is the structural classification DeriveTyped narrows a checker type
// into. A Leaf wraps a TypeNode unchanged (DeriveTypeF never classifies a
// function, a constructor, or a Keyed brand). Func's Ret is the call
// signature's return type; Ctor's Ret is the construct signature's instance
// type; both share Args, the signature's parameter types, each independently
// reclassified. Tag's Inner is the Keyed brand's stripped base. Union's
// Members are its alternatives, each independently reclassified — so a member
// that is itself a function, a constructor, or another union nests correctly.
type Derived struct {
	Kind DerivedKind
	Leaf *TypeNode

	Ret  *Derived
	Args []*Derived

	Tag   string
	Inner *Derived

	Members []*Derived
}

// DeriveTyped classifies a checker type: a `Keyed<T, K>` brand first (so a
// keyed factory or class still classifies its stripped base as Func/Ctor
// beneath the tag), then a construct signature (checked before call, matching
// TypeFor<T>'s own conditional order — only the FIRST construct/call signature
// is read, so an overloaded declaration narrows to its first overload), then a
// call signature, then the nullish singletons and a general union (an
// optional parameter's implicit `| undefined` reaches here), and otherwise the
// plain DeriveTypeF leaf. Each recursion point — a signature's return/instance
// type, its parameters, a tag's inner type, a union's members — reclassifies
// from scratch, so a factory that itself returns a factory nests
// `Type.func(Type.func(...))` the way a hand-writer would spell it.
func DeriveTyped(ctx *Context, checker *shimchecker.Checker, t *shimchecker.Type, failure *Failure) (*Derived, bool) {
	if t == nil {
		return nil, false
	}
	if key, ok := KeyLiteralFor(t, checker); ok {
		base := KeyedBaseType(t, checker)
		inner, ok := DeriveTyped(ctx, checker, base, failure)
		if !ok {
			return nil, false
		}
		return &Derived{Kind: DerivedTag, Tag: key, Inner: inner}, true
	}
	if ctorSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindConstruct); len(ctorSigs) != 0 {
		return deriveSignatureShaped(ctx, checker, ctorSigs[0], failure, DerivedCtor)
	}
	if callSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall); len(callSigs) != 0 {
		return deriveSignatureShaped(ctx, checker, callSigs[0], failure, DerivedFunc)
	}
	if t.Flags()&shimchecker.TypeFlagsUndefined != 0 {
		return &Derived{Kind: DerivedUndefined}, true
	}
	if t.Flags()&shimchecker.TypeFlagsNull != 0 {
		return &Derived{Kind: DerivedNull}, true
	}
	if isGeneralUnion(t) {
		return deriveUnion(ctx, checker, t, failure)
	}
	node, ok := DeriveTypeF(ctx, t, failure)
	if !ok {
		return nil, false
	}
	return &Derived{Kind: DerivedLeaf, Leaf: node}, true
}

// isGeneralUnion reports whether t is a union this layer decomposes itself,
// rather than leaving it to DeriveTypeF's own pure-literal-union handling —
// every union except the wide `boolean` intrinsic, which is internally a union
// of its two literals but is named directly instead of decomposed.
func isGeneralUnion(t *shimchecker.Type) bool {
	flags := t.Flags()
	if flags&shimchecker.TypeFlagsUnion == 0 {
		return false
	}
	return flags&shimchecker.TypeFlagsBoolean == 0 || flags&shimchecker.TypeFlagsBooleanLiteral != 0
}

// deriveUnion decomposes a union into its DERIVED members, non-nullish first
// and the nullish singletons last — an optional parameter's implicit
// `| undefined` reads as its real type qualified by absence, not the other
// way around, matching the convention every other optional-value spelling in
// this engine follows. A true/false literal PAIR collapses back into the
// single wide `boolean` member they stand for — the checker flattens
// `boolean` into its two literals inside a larger union, so this reverses
// that into the name a hand-writer would have spelled — any other lone
// boolean literal derives as itself, unaffected.
func deriveUnion(ctx *Context, checker *shimchecker.Checker, t *shimchecker.Type, failure *Failure) (*Derived, bool) {
	types := t.Types()
	trueIdx, falseIdx := -1, -1
	for i, member := range types {
		if member.Flags()&shimchecker.TypeFlagsBooleanLiteral == 0 {
			continue
		}
		if value, ok := member.AsLiteralType().Value().(bool); ok && value {
			trueIdx = i
		} else {
			falseIdx = i
		}
	}
	collapseBoolean := trueIdx >= 0 && falseIdx >= 0

	members := make([]*Derived, 0, len(types))
	if collapseBoolean {
		members = append(members, &Derived{Kind: DerivedLeaf, Leaf: &TypeNode{Kind: TypeNodeNamed, Name: "boolean", From: "global"}})
	}
	var nullish []*Derived
	for i, member := range types {
		if collapseBoolean && (i == trueIdx || i == falseIdx) {
			continue
		}
		derived, ok := DeriveTyped(ctx, checker, member, failure)
		if !ok {
			return nil, false
		}
		if derived.Kind == DerivedUndefined || derived.Kind == DerivedNull {
			nullish = append(nullish, derived)
			continue
		}
		members = append(members, derived)
	}
	members = append(members, nullish...)
	return &Derived{Kind: DerivedUnion, Members: members}, true
}

// deriveSignatureShaped derives a Func/Ctor node from one signature: its
// return type (the function's product, or the constructor's instance) and its
// parameter types, each independently reclassified via DeriveTyped.
func deriveSignatureShaped(
	ctx *Context,
	checker *shimchecker.Checker,
	sig *shimchecker.Signature,
	failure *Failure,
	kind DerivedKind,
) (*Derived, bool) {
	ret, ok := DeriveTyped(ctx, checker, checker.GetReturnTypeOfSignature(sig), failure)
	if !ok {
		return nil, false
	}
	params := shimchecker.Signature_parameters(sig)
	args := make([]*Derived, 0, len(params))
	for _, param := range params {
		paramType := checker.GetTypeOfSymbol(param)
		if paramType == nil {
			return nil, false
		}
		argNode, ok := DeriveTyped(ctx, checker, paramType, failure)
		if !ok {
			return nil, false
		}
		args = append(args, argNode)
	}
	return &Derived{Kind: kind, Ret: ret, Args: args}, true
}

// KindName is the TypeBase<Kind> discriminant string a derivation's `.kind`
// accessor reads off a Derived node — the same literal the runtime `Type.*`
// factory the node emits as would stamp on its `kind` field.
func KindName(d *Derived) string {
	switch d.Kind {
	case DerivedFunc:
		return "func"
	case DerivedCtor:
		return "ctor"
	case DerivedTag:
		return "tag"
	case DerivedUnion:
		return "union"
	case DerivedUndefined, DerivedNull:
		return "literal"
	case DerivedLeaf:
		switch d.Leaf.Kind {
		case TypeNodeLiteral:
			return "literal"
		case TypeNodeUnion:
			return "union"
		case TypeNodePlaceholder:
			return "generic"
		default:
			if d.Leaf.From == "global" {
				return "global"
			}
			return "imported"
		}
	default:
		return ""
	}
}

package tokens

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
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
	DerivedAbstractCtor
	DerivedTag
	DerivedUnion
	DerivedUndefined
	DerivedNull
)

// Derived is the structural classification DeriveTyped narrows a checker type
// into. A Leaf wraps a TypeNode unchanged (DeriveTypeF never classifies a
// function, a constructor, or a Keyed brand). Func's Ret is the FIRST call
// signature's return type; Ctor's/AbstractCtor's Ret is the FIRST construct
// signature's instance type; both share Args, one ROW of parameter types per
// signature in declaration order, each parameter independently reclassified.
// AbstractCtor is its own kind rather than a flag on Ctor, matching the
// `Type` node contract's own `'ctor'`/`'abstract-ctor'` split — a type
// coming from an `abstract class` declaration derives as AbstractCtor, every
// other construct-signature-bearing type as Ctor. Tag's Inner is the Keyed
// brand's stripped base. Union's Members are its alternatives, each
// independently reclassified — so a member that is itself a function, a
// constructor, or another union nests correctly.
type Derived struct {
	Kind DerivedKind
	Leaf *TypeNode

	Ret  *Derived
	Args [][]*Derived

	Tag   string
	Inner *Derived

	Members []*Derived
}

// DeriveTyped classifies a checker type: a `Keyed<T, K>` brand first (so a
// keyed factory or class still classifies its stripped base as Func/Ctor
// beneath the tag), then a NAMED type by its own name — a call or construct
// signature never overrides that, and neither does whether one of its type
// arguments is open or closed, so `ScopeFactory<X>` derives the same way
// whichever X it closes over. The func package's Ctor/Func/AbstractCtor are
// the sole exception to naming: those three, and any genuinely anonymous
// callable literal (which has no name to derive by in the first place), fall
// through to the construct signatures (checked before call, matching
// TypeFor<T>'s own conditional order — EVERY signature is read, so an
// overloaded declaration carries one parameter row per overload), then the
// call signatures, then the nullish singletons and a general union (an
// optional parameter's implicit `| undefined` reaches here; one spelled
// through an exported alias derives as that name instead of decomposing),
// and otherwise the plain DeriveTypeF leaf. Each recursion point — a
// signature's return/instance type, its parameters, a tag's inner type, a
// union's members — reclassifies from scratch, so a factory that itself
// returns a factory nests `Type.func(Type.func(...))` the way a hand-writer
// would spell it.
func DeriveTyped(ctx *Context, checker *shimchecker.Checker, t *shimchecker.Type, failure *Failure) (*Derived, bool) {
	if t == nil {
		return nil, false
	}
	if key, ok := KeyLiteralFor(t, checker); ok {
		if base := KeyedBaseType(t, checker); base != t {
			inner, ok := DeriveTyped(ctx, checker, base, failure)
			if !ok {
				return nil, false
			}
			return &Derived{Kind: DerivedTag, Tag: key, Inner: inner}, true
		}
		// No single recoverable base: the brand rode in through union members
		// (an optional keyed slot's `| undefined`, or a keyed union spelled
		// member by member), so derive the union itself and let each member's
		// own brand read fire. Anything else carrying an unstrippable brand is
		// underivable — re-deriving t here would recurse forever.
		if isGeneralUnion(t) {
			return deriveUnion(ctx, checker, t, failure)
		}
		return nil, false
	}
	// The hole brand itself is read before naming — `Generic<L, C>` / `$<L>`
	// is spelled as the hole regardless of what its constraint C bears (a
	// constrained hole is still a hole even when C is itself callable), and a
	// constrained hole's C can carry a symbol of its own that the named check
	// below would otherwise claim first.
	if label, ok := GenericLabelFor(t, checker); ok {
		return &Derived{Kind: DerivedLeaf, Leaf: &TypeNode{Kind: TypeNodePlaceholder, Label: label}}, true
	}
	// A named type is derived by the node it is SPELLED as, before any
	// structural classification: its address is its name plus its own type
	// arguments (each independently reclassified — a hole among them derives
	// to `Type.generic(label)`, anything else to its own address), which is
	// the spelling a registration carries. The func package's Ctor/AbstractCtor
	// interfaces are the narrow exception below.
	//
	// A general union defers to its OWN gate further down (isGeneralUnion):
	// unions have a THIRD option this rule does not — decomposing into their
	// members — and addressableAliasSymbol's export-status test decides that
	// case on narrower grounds than "has a symbol." A hole sitting in a
	// signature SLOT is reached through the signature walk below instead, so
	// an open signature still classifies as Func/Ctor.
	//
	// An ANONYMOUS object type is excluded up front, before the symbol check,
	// even though one can still carry a symbol: `typeof Foo` — the type an
	// OBSERVED class or function value has — sets its `.symbol` to the
	// declaration's own symbol purely for reflection (so `keyof typeof Foo`
	// and friends work), while its ObjectFlags mark it Anonymous rather than
	// Class/Interface, because it is not the declared type Foo names — it is
	// the checker's synthesized description of Foo's call/construct
	// signatures. `Func<Args, Return>` resolves to exactly this shape too (a
	// bare function type literal under an alias), which is what makes the
	// explicit exception below only need to name Ctor/AbstractCtor.
	if t.ObjectFlags()&shimchecker.ObjectFlagsAnonymous == 0 && !isGeneralUnion(t) {
		if symbol := resolvedSymbolFor(t); symbol != nil && !isFuncPackageCallable(ctx, symbol) {
			node, ok := deriveNamedNode(ctx, t, symbol, failure)
			if !ok {
				return nil, false
			}
			return &Derived{Kind: DerivedLeaf, Leaf: node}, true
		}
	}
	if ctorSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindConstruct); len(ctorSigs) != 0 {
		kind := DerivedCtor
		if isAbstractConstructor(t) {
			kind = DerivedAbstractCtor
		}
		return deriveSignatureShaped(ctx, checker, ctorSigs, failure, kind)
	}
	if callSigs := shimchecker.Checker_getSignaturesOfType(checker, t, shimchecker.SignatureKindCall); len(callSigs) != 0 {
		return deriveSignatureShaped(ctx, checker, callSigs, failure, DerivedFunc)
	}
	if t.Flags()&shimchecker.TypeFlagsUndefined != 0 {
		return &Derived{Kind: DerivedUndefined}, true
	}
	if t.Flags()&shimchecker.TypeFlagsNull != 0 {
		return &Derived{Kind: DerivedNull}, true
	}
	if isGeneralUnion(t) {
		// A union spelled through an addressable alias derives as the NAME it
		// was spelled through — the same kind of decomposition exclusion as the
		// wide `boolean` intrinsic — so its address cannot shift with the
		// union's membership. A local alias has no spellable address, so its
		// union derives structurally, like one spelled member by member.
		if symbol := addressableAliasSymbol(ctx, t); symbol != nil {
			node, ok := deriveNamedNode(ctx, t, symbol, failure)
			if !ok {
				return nil, false
			}
			return &Derived{Kind: DerivedLeaf, Leaf: node}, true
		}
		return deriveUnion(ctx, checker, t, failure)
	}
	node, ok := DeriveTypeF(ctx, t, failure)
	if !ok {
		return nil, false
	}
	return &Derived{Kind: DerivedLeaf, Leaf: node}, true
}

// funcPackageCallableNames are the three @rhombus-toolkit/func spellings that
// route to a callable Type kind structurally regardless of naming — the
// narrow exception "named derives by name" carves out. A same-named type
// declared anywhere else is not exempt and derives by name like everything
// else.
var funcPackageCallableNames = map[string]bool{"Ctor": true, "Func": true, "AbstractCtor": true}

// isFuncPackageCallable reports whether symbol is Ctor, Func, or AbstractCtor
// as exported by @rhombus-toolkit/func specifically.
func isFuncPackageCallable(ctx *Context, symbol *shimast.Symbol) bool {
	if !funcPackageCallableNames[symbol.Name] {
		return false
	}
	decl := primaryDeclaration(symbol)
	if decl == nil {
		return false
	}
	sourceFile := shimast.GetSourceFileOfNode(decl)
	if sourceFile == nil {
		return false
	}
	pkg := nearestPackage(ctx, sourceFile.FileName())
	return pkg != nil && pkg.name == "@rhombus-toolkit/func"
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

// deriveSignatureShaped derives a Func/Ctor node from a whole signature list:
// one parameter row per signature, in declaration order, each parameter
// independently reclassified via DeriveTyped. The node carries ONE head — the
// function's product, or the constructor's instance — read off the first
// signature, since that is the type the value is named by.
func deriveSignatureShaped(
	ctx *Context,
	checker *shimchecker.Checker,
	sigs []*shimchecker.Signature,
	failure *Failure,
	kind DerivedKind,
) (*Derived, bool) {
	ret, ok := DeriveTyped(ctx, checker, checker.GetReturnTypeOfSignature(sigs[0]), failure)
	if !ok {
		return nil, false
	}
	rows := make([][]*Derived, 0, len(sigs))
	for _, sig := range sigs {
		params := shimchecker.Signature_parameters(sig)
		spreadsLastParameter := shimchecker.Signature_hasRestParameter(sig)
		row := make([]*Derived, 0, len(params))
		for i, param := range params {
			paramType := checker.GetTypeOfSymbol(param)
			if paramType == nil {
				return nil, false
			}
			// A tuple-typed REST parameter stands for one argument per slot, so
			// the single slot it occupies here would misstate the call's arity.
			// Expanding it into one slot per element is a derivation of its own,
			// not this one, so the whole signature is underivable instead.
			if spreadsLastParameter && i == len(params)-1 && shimchecker.IsTupleType(paramType) {
				return nil, false
			}
			argNode, ok := DeriveTyped(ctx, checker, paramType, failure)
			if !ok {
				return nil, false
			}
			row = append(row, argNode)
		}
		rows = append(rows, row)
	}
	return &Derived{Kind: kind, Ret: ret, Args: rows}, true
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
	case DerivedAbstractCtor:
		return "abstract-ctor"
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
		case TypeNodeTuple:
			return "tuple"
		case TypeNodePlaceholder:
			return "generic"
		case TypeNodeTag:
			return "tag"
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

package tokens

import (
	"sort"
	"strconv"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// TypeNode is the STRUCTURED form of a derived token — the same derivation
// DeriveTokenF walks, kept as a small tree instead of being joined into a flat
// string. It carries exactly the kinds the flat walk ever produced: a named type
// (with its generic arguments), a literal value, a literal union, an
// open-generic hole placeholder, and a keyed type (the `Keyed<T, K>` brand read
// in a nested position — a list element, a generic argument).
type TypeNode struct {
	Kind TypeNodeKind

	// Named: Name/From are the export name and its qualifying source ("global"
	// for an unqualified / default-lib name); Args are the closed generic type
	// arguments, in order.
	Name string
	From string
	Args []*TypeNode

	// Literal: the single literal value.
	Literal LiteralValue

	// Union: a pure-literal union's members, each itself a Literal node, in
	// checker order (unsorted — a renderer that needs the canonical sorted-join
	// spelling sorts at render time).
	Members []*TypeNode

	// Placeholder: the hole's label.
	Label string

	// Tag: the branded base and the key composed onto it.
	Inner *TypeNode
	Tag   string
}

// TypeNodeKind discriminates a TypeNode's populated fields.
type TypeNodeKind int

const (
	TypeNodeNamed TypeNodeKind = iota
	TypeNodeLiteral
	TypeNodeUnion
	TypeNodePlaceholder
	TypeNodeTag
)

// DeriveTypeF is DeriveTokenF's own walk, kept as a tree instead of joined into a
// string. It is the structural sibling every string caller now renders from
// (renderTypeNode) — see DeriveTokenF below — so the two can never drift: a
// change to one changes the other's answer too. ok=false marks the same failures
// DeriveTokenF reports (a nameless anonymous structure, an unbound type
// parameter), through the same Failure channel.
func DeriveTypeF(ctx *Context, t *shimchecker.Type, failure *Failure) (*TypeNode, bool) {
	if t == nil {
		return nil, false
	}
	if node, ok := deriveLiteralNode(t); ok {
		return node, true
	}
	if name, ok := intrinsicToken(t); ok {
		return &TypeNode{Kind: TypeNodeNamed, Name: name, From: "global"}, true
	}
	// A Hole-branded placeholder is read before the alias/symbol path: an
	// aliased or constrained hole carries a symbol that would otherwise mint an
	// alias node, and the bare `Hole<"1">` is an anonymous `__type`.
	if label, ok := GenericLabelFor(t, ctx.Checker); ok {
		return &TypeNode{Kind: TypeNodePlaceholder, Label: label}, true
	}
	if t.Flags()&shimchecker.TypeFlagsTypeParameter != 0 {
		if failure != nil {
			failure.UnboundTypeParameter = t
		}
		return nil, false
	}
	// The Keyed brand is read BEFORE alias naming, exactly as the top-level
	// classification does: the brand alias carries a symbol that would otherwise
	// mint a named node for `Keyed` itself, when the type it spells is the base
	// wearing a key. An Inject pin under the key names an arbitrary token string
	// with no node spelling, and a base this walk cannot recover has nothing to
	// wrap — both are underivable here rather than misnamed.
	if key, ok := KeyLiteralFor(t, ctx.Checker); ok {
		if _, pinned := InjectTokenFor(t, ctx.Checker); pinned {
			return nil, false
		}
		base := KeyedBaseType(t, ctx.Checker)
		if base == t {
			return nil, false
		}
		inner, ok := DeriveTypeF(ctx, base, failure)
		if !ok {
			return nil, false
		}
		return &TypeNode{Kind: TypeNodeTag, Inner: inner, Tag: key}, true
	}

	symbol := resolvedSymbolFor(t)
	if symbol == nil {
		return nil, false
	}
	return deriveNamedNode(ctx, t, symbol, failure)
}

// resolvedSymbolFor returns the symbol a type is spelled by, direct or through
// its alias, or nil when the type carries no addressable name: no symbol at
// all, or an anonymous / synthesized one (typescript-go's internal `__type`
// marker) a caller could never spell. DeriveTyped's own named-type check
// shares this resolution with DeriveTypeF's, so the two can never disagree
// about whether a given type has a name to derive by.
func resolvedSymbolFor(t *shimchecker.Type) *shimast.Symbol {
	symbol := t.Symbol()
	if alias := aliasOf(t); alias != nil && alias.symbol != nil {
		symbol = alias.symbol
	}
	if symbol == nil || symbol.Name == "" || isInternalSymbolName(symbol.Name) {
		return nil
	}
	return symbol
}

// deriveNamedNode builds the Named node a symbol-bearing type spells: the
// FROM/NAME pair off the symbol's primary declaration, plus the closed generic
// type arguments, each recursively derived.
func deriveNamedNode(ctx *Context, t *shimchecker.Type, symbol *shimast.Symbol, failure *Failure) (*TypeNode, bool) {
	decl := primaryDeclaration(symbol)
	if decl == nil {
		return nil, false
	}
	sourceFile := shimast.GetSourceFileOfNode(decl)
	if sourceFile == nil {
		return nil, false
	}
	from, baseName := baseTokenForPair(ctx, symbol, sourceFile)

	args := genericTypeArguments(ctx, t)
	if collectionTokenBases[renderNamedBase(from, baseName)] && len(args) > 1 {
		args = args[:1]
	}
	argNodes := make([]*TypeNode, 0, len(args))
	for _, arg := range args {
		argNode, ok := DeriveTypeF(ctx, arg, failure)
		if !ok {
			return nil, false
		}
		argNodes = append(argNodes, argNode)
	}
	return &TypeNode{Kind: TypeNodeNamed, Name: baseName, From: from, Args: argNodes}, true
}

// KeyedBaseType returns the underlying T of a `Keyed<T, K>` brand, for a
// caller that already confirmed t is keyed via KeyLiteralFor: the
// phantom-brand intersection member(s) stripped, or — when the checker
// distributed the brand intersection over a union T's members — the spelled T
// recovered from the alias record. Returns t UNCHANGED when no single base is
// recoverable; a caller must treat that as "no base", never re-derive t
// itself. The Inject-pinned-base branch has no structural equivalent (an
// Inject brand pins an arbitrary token STRING with no corresponding TS type),
// so a caller wanting that string still goes through KeyedTokenFor.
func KeyedBaseType(t *shimchecker.Type, checker *shimchecker.Checker) *shimchecker.Type {
	if base := stripBrandMembers(t, checker); base != t {
		return base
	}
	if base := distributedAliasBase(t, checker); base != nil {
		return base
	}
	return t
}

// renderNamedBase joins a Named node's From/Name pair into the flat base token:
// bare Name when From is the "global" sentinel (no qualifier), else
// "From:Name" — the exact shape baseTokenFor rendered before the FROM/NAME split.
func renderNamedBase(from, name string) string {
	if from == "global" {
		return name
	}
	return from + ":" + name
}

// literalNodeValue extracts a String/Number/BigInt/BooleanLiteral value in
// SingletonValue's representation, restricted to literalText's domain — no
// null/undefined/void — so a TypeNodeLiteral fires in exactly the cases the flat
// literal walk below does.
func literalNodeValue(t *shimchecker.Type) (LiteralValue, bool) {
	v, ok := SingletonValue(t)
	if !ok || v.Kind == LiteralNull || v.Kind == LiteralUndefined {
		return LiteralValue{}, false
	}
	return v, true
}

// deriveLiteralNode classifies a single literal type or a pure-literal union: a
// single literal renders as a TypeNodeLiteral, a pure-literal union (every member
// a String/Number/BigInt/BooleanLiteral) as a TypeNodeUnion of TypeNodeLiteral
// members. The wide `boolean` scalar (Boolean flag without BooleanLiteral) is
// excluded up front, before the union branch, so a wide-boolean union never
// decomposes into its two literal members here — it falls through to
// intrinsicToken instead.
func deriveLiteralNode(t *shimchecker.Type) (*TypeNode, bool) {
	flags := t.Flags()
	if flags&shimchecker.TypeFlagsBoolean != 0 && flags&shimchecker.TypeFlagsBooleanLiteral == 0 {
		return nil, false
	}
	if v, ok := literalNodeValue(t); ok {
		return &TypeNode{Kind: TypeNodeLiteral, Literal: v}, true
	}
	if flags&shimchecker.TypeFlagsUnion != 0 {
		members := t.Types()
		nodes := make([]*TypeNode, 0, len(members))
		for _, member := range members {
			v, ok := literalNodeValue(member)
			if !ok {
				return nil, false
			}
			nodes = append(nodes, &TypeNode{Kind: TypeNodeLiteral, Literal: v})
		}
		if len(nodes) == 0 {
			return nil, false
		}
		return &TypeNode{Kind: TypeNodeUnion, Members: nodes}, true
	}
	return nil, false
}

// renderLiteral reproduces literalText's exact spelling from a LiteralValue: a
// JSON-quoted string, a number/bigint with the sign reattached, or the
// "true"/"false" boolean text. Null/Undefined never reach here — literalNodeValue
// excludes them.
func renderLiteral(v LiteralValue) string {
	switch v.Kind {
	case LiteralString:
		return strconv.Quote(v.Str)
	case LiteralNumber:
		if v.Negated {
			return "-" + v.Text
		}
		return v.Text
	case LiteralBigInt:
		if v.Negated {
			return "-" + v.Text + "n"
		}
		return v.Text + "n"
	case LiteralBoolean:
		return strconv.FormatBool(v.Bool)
	default:
		return ""
	}
}

// RenderTypeNode is the flat token string a TypeNode spells — the canonical
// spelling of a derived type, and so the identity a caller keys one on.
func RenderTypeNode(n *TypeNode) string {
	return renderTypeNode(n)
}

// renderTypeNode renders a TypeNode back into DeriveTokenF's flat token string —
// byte-identical to what the pre-split walk produced for the same input, since
// this is that walk's join step read off the tree instead of built inline.
func renderTypeNode(n *TypeNode) string {
	switch n.Kind {
	case TypeNodeLiteral:
		return renderLiteral(n.Literal)
	case TypeNodeUnion:
		parts := make([]string, len(n.Members))
		for i, m := range n.Members {
			parts[i] = renderLiteral(m.Literal)
		}
		sort.Strings(parts)
		return strings.Join(parts, " | ")
	case TypeNodePlaceholder:
		return "$" + n.Label
	case TypeNodeTag:
		return renderTypeNode(n.Inner) + "#" + n.Tag
	case TypeNodeNamed:
		base := renderNamedBase(n.From, n.Name)
		if len(n.Args) == 0 {
			return base
		}
		parts := make([]string, len(n.Args))
		for i, a := range n.Args {
			parts[i] = renderTypeNode(a)
		}
		return base + "<" + strings.Join(parts, ",") + ">"
	default:
		return ""
	}
}

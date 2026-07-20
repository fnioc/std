package tokens

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
)

// This file extends the token-derivation core with the pieces the registration
// transformer needs beyond bare name derivation: open-generic hole handling, the
// Inject/Hole brand walks, the unbound-type-parameter failure channel, and the
// literal/singleton classifiers. It reuses the in-package derivation leaves
// (literalToken, intrinsicToken, baseTokenFor, genericTypeArguments,
// primaryDeclaration, aliasOf) so there is a single source of truth for the base
// token shape; only the recursion orchestration is restated so a hole reached at
// any depth of a closed-generic argument renders as `$N`.

// The unique-symbol brand property names. A branded type carries a
// computed-symbol optional property whose declaring `const` is named exactly one
// of these; the literal type of that property is the extracted payload.
const (
	injectBrandProperty = "TOK"
	holeBrandProperty   = "HOLE"
	// keyBrandProperty is the Keyed<T, K> brand — detected exactly like the Inject
	// brand, except the extracted literal is the KEY string K that composes onto
	// the derived base token as a `#K` suffix:
	//   declare const KEY: unique symbol;
	//   type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
	keyBrandProperty = "KEY"
)

// brandPropertyNames is the set of every phantom-brand computed-symbol property
// name. A brand-object constituent of an intersection (`{ readonly [KEY]?: K }`)
// carries ONLY such a property; a real user type never does. Used by
// stripBrandMembers to recover the underlying T from a Keyed<T, K> intersection.
var brandPropertyNames = map[string]bool{
	injectBrandProperty: true,
	holeBrandProperty:   true,
	keyBrandProperty:    true,
	"ARG":               true,
}

// Failure is the channel through which DeriveTokenF reports that derivation hit
// an unbound type parameter (as opposed to a nameless anonymous structure). A
// caller that cares supplies a pointer; the field is set when the sharper
// diagnostic applies, otherwise it stays nil.
type Failure struct {
	UnboundTypeParameter *shimchecker.Type
}

// DeriveTokenF derives the token for a type with open-generic hole support and
// the unbound-type-parameter failure channel — the derivation the registration
// transformer uses. It mirrors DeriveToken exactly, adding the hole render (`$N`)
// before the symbol lookup and reporting an unbound type parameter through
// failure. ok=false marks a nameless anonymous structure or an unbound type
// parameter (the caller turns that into a hard diagnostic).
func DeriveTokenF(ctx *Context, t *shimchecker.Type, failure *Failure) (string, bool) {
	if t == nil {
		return "", false
	}
	if lit, ok := literalToken(t); ok {
		return lit, true
	}
	if name, ok := intrinsicToken(t); ok {
		return name, true
	}
	// A Hole-branded placeholder tokenizes as `$N`, before the alias/symbol path:
	// an aliased or constrained hole carries a symbol that would otherwise mint an
	// alias token, and the bare `Hole<1>` is an anonymous `__type`.
	if hole, ok := HoleNumberFor(t, ctx.Checker); ok {
		return "$" + strconv.Itoa(hole), true
	}
	if t.Flags()&shimchecker.TypeFlagsTypeParameter != 0 {
		if failure != nil {
			failure.UnboundTypeParameter = t
		}
		return "", false
	}

	symbol := t.Symbol()
	if alias := aliasOf(t); alias != nil && alias.symbol != nil {
		symbol = alias.symbol
	}
	if symbol == nil {
		return "", false
	}
	name := symbol.Name
	// A nameless anonymous structure has no token. TypeScript rejects the display
	// name `__type`; typescript-go stores internal symbol names behind a single
	// prefix byte (0xFE, an invalid UTF-8 sequence that never occurs in a real
	// identifier — the anonymous type literal is `"\xFEtype"`, an object literal
	// `"\xFEobject"`, etc.), so the byte-identical equivalent is rejecting the
	// whole internal-prefixed family, none of which is an importable export.
	if name == "" || isInternalSymbolName(name) {
		return "", false
	}
	decl := primaryDeclaration(symbol)
	if decl == nil {
		return "", false
	}
	sourceFile := shimast.GetSourceFileOfNode(decl)
	if sourceFile == nil {
		return "", false
	}
	base := baseTokenFor(ctx, symbol, sourceFile)

	args := genericTypeArguments(ctx, t)
	if len(args) == 0 {
		return base, true
	}
	if collectionTokenBases[base] && len(args) > 1 {
		args = args[:1]
	}
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		token, ok := DeriveTokenF(ctx, arg, failure)
		if !ok {
			return "", false
		}
		parts = append(parts, token)
	}
	return base + "<" + strings.Join(parts, ",") + ">", true
}

// internalSymbolNamePrefix is typescript-go's marker byte for a synthesized
// (non-source) symbol name — an invalid UTF-8 sequence that never appears in a
// real identifier.
const internalSymbolNamePrefix = "\xFE"

// isInternalSymbolName reports whether a symbol name is a typescript-go internal
// (anonymous / synthesized) name rather than a source identifier.
func isInternalSymbolName(name string) bool {
	return strings.HasPrefix(name, internalSymbolNamePrefix)
}

// TokenForType is the classification entry point: the derived token, or ok=false
// for a nameless anonymous structure / unbound type parameter (reported through
// failure when supplied).
func TokenForType(ctx *Context, t *shimchecker.Type, failure *Failure) (string, bool) {
	return DeriveTokenF(ctx, t, failure)
}

// TokenForReturnType derives the token for a signature's return type — a
// factory's product. An async factory's `Promise<X>` derives the honest
// closed-generic token; a primitive return that yields no token returns
// ok=false, so the caller treats the parameter as a plain slot rather than a
// factory.
func TokenForReturnType(ctx *Context, signature *shimchecker.Signature) (string, bool) {
	returnType := ctx.Checker.GetReturnTypeOfSignature(signature)
	if returnType == nil {
		return "", false
	}
	return DeriveTokenF(ctx, returnType, nil)
}

// IntrinsicToken exposes the in-package intrinsic classifier: the bare keyword
// token for an intrinsic type, or ok=false otherwise.
func IntrinsicToken(t *shimchecker.Type) (string, bool) {
	return intrinsicToken(t)
}

// AliasSymbolName returns the name of the type's alias symbol
// (`type.aliasSymbol.getName()`), or "" when the type is not an alias
// instantiation. Used to detect brand aliases like `Typeof<T>` spelled through
// an alias.
func AliasSymbolName(t *shimchecker.Type) string {
	if a := aliasOf(t); a != nil && a.symbol != nil {
		return a.symbol.Name
	}
	return ""
}

// AliasTypeArguments returns the type arguments an alias instantiation was
// applied with (`type.aliasTypeArguments`), or nil.
func AliasTypeArguments(t *shimchecker.Type) []*shimchecker.Type {
	if a := aliasOf(t); a != nil {
		return a.typeArguments
	}
	return nil
}

// SymbolName returns the underlying symbol's name (`type.getSymbol().getName()`),
// or "" when the type has no symbol.
func SymbolName(t *shimchecker.Type) string {
	if s := t.Symbol(); s != nil {
		return s.Name
	}
	return ""
}

// AliasSymbol returns the type's alias symbol, or nil when the type is not an
// alias instantiation.
func AliasSymbol(t *shimchecker.Type) *shimast.Symbol {
	if a := aliasOf(t); a != nil {
		return a.symbol
	}
	return nil
}

// HoleNumberFor returns the hole number N of a `Hole<N, C>`-branded type, or
// ok=false when the type is not a hole.
func HoleNumberFor(t *shimchecker.Type, checker *shimchecker.Checker) (int, bool) {
	return brandLiteralFor(t, checker, holeBrandProperty, extractNumberLiteral)
}

// InjectTokenFor returns the literal token K of an `Inject<T, K>`-branded type,
// or ok=false when the type is not branded. Union-aware: a
// `Inject<T,K> | undefined` (from `x?: Inject<T,K>`) is unwrapped member-wise.
func InjectTokenFor(t *shimchecker.Type, checker *shimchecker.Checker) (string, bool) {
	if t.Flags()&shimchecker.TypeFlagsUnion != 0 {
		for _, member := range t.Types() {
			if member.Flags()&(shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsNull) != 0 {
				continue
			}
			if token, ok := InjectTokenFor(member, checker); ok {
				return token, true
			}
		}
		return "", false
	}
	return brandLiteralFor(t, checker, injectBrandProperty, extractStringLiteral)
}

// KeyLiteralFor returns the literal key string K of a `Keyed<T, K>`-branded
// type, or ok=false when the type is not keyed. Detection mirrors InjectTokenFor
// exactly: union-aware (an optional `x?: Keyed<T, K>` resolves to
// `(T & { [KEY]?: K }) | undefined`, whose common properties omit the brand),
// then a brandLiteralFor property walk for a computed-symbol property named KEY.
func KeyLiteralFor(t *shimchecker.Type, checker *shimchecker.Checker) (string, bool) {
	if t.Flags()&shimchecker.TypeFlagsUnion != 0 {
		for _, member := range t.Types() {
			if member.Flags()&(shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsNull) != 0 {
				continue
			}
			if key, ok := KeyLiteralFor(member, checker); ok {
				return key, true
			}
		}
		return "", false
	}
	return brandLiteralFor(t, checker, keyBrandProperty, extractStringLiteral)
}

// keyedBaseTokenFor derives the BASE token of a `Keyed<T, K>` type — the token
// the underlying T tokenizes to, phantom brand stripped and with NO `#key`
// suffix. The base derives from T two ways, checked in order so Keyed stacks
// orthogonally with Inject:
//  1. An `Inject<T, "tok">` brand under the Keyed pins the base explicitly
//     (`Keyed<Inject<T, "tok">, "k">` → base `tok`) — InjectTokenFor reads [TOK]
//     off the same flattened intersection.
//  2. Otherwise the base derives structurally from T with the phantom-brand
//     members stripped off the intersection (stripBrandMembers), since the raw
//     `T & { [KEY]?: K }` intersection has no symbol of its own. Hole-aware
//     derivation (DeriveTokenF, not DeriveToken): a keyed base that itself
//     contains an open-generic hole (`Keyed<IThing<Hole<1>>, "k">`) must render
//     `IThing<$1>` — DeriveToken has no hole branch and would bail.
//
// Returns ok=false when no base is derivable.
func keyedBaseTokenFor(ctx *Context, t *shimchecker.Type) (string, bool) {
	if base, ok := InjectTokenFor(t, ctx.Checker); ok {
		return base, true
	}
	return DeriveTokenF(ctx, stripBrandMembers(t, ctx.Checker), nil)
}

// KeyedTokenFor returns the composed keyed token `<base>#<key>` when t carries
// the `Keyed<T, K>` brand, or ok=false so the caller falls through to normal
// derivation. A key is NOT a parallel resolution subsystem — it is a `#<key>`
// suffix on the ordinary token the underlying T derives, so
// `Keyed<ICache, "redis">` composes `caching.core:ICache#redis`.
//
// Returns ok=false when no base is derivable — the caller's normal path then
// raises the appropriate diagnostic.
func KeyedTokenFor(ctx *Context, t *shimchecker.Type) (string, bool) {
	key, ok := KeyLiteralFor(t, ctx.Checker)
	if !ok {
		return "", false
	}
	base, ok := keyedBaseTokenFor(ctx, t)
	if !ok {
		return "", false
	}
	return base + "#" + key, true
}

// ServiceBaseTokenFor derives the token the nameof stage lowers a service TYPE
// to. For an ordinary type it is DeriveTokenF. For a `Keyed<T, K>` type it is
// just the BASE (keyedBaseTokenFor) — the brand stripped, NO `#key` suffix — so
// the inline registration path (`add<T>()` → `this.add(nameof<T>(), ctor,
// signatureof(ctor), keyof<T>())`) composes that base with keyof<T>()'s key at
// runtime and lands on the SAME `base#key` token the di direct stage derives via
// KeyedTokenFor. Without it a keyed nameof would tokenize the whole aliased
// `Keyed<...>` reference — a nonsense token diverging from the direct path.
func ServiceBaseTokenFor(ctx *Context, t *shimchecker.Type) (string, bool) {
	if _, keyed := KeyLiteralFor(t, ctx.Checker); keyed {
		return keyedBaseTokenFor(ctx, t)
	}
	return DeriveTokenF(ctx, t, nil)
}

// stripBrandMembers recovers the underlying T from a `Keyed<T, K>` (and any
// stacked-brand) intersection by dropping every phantom-brand-object
// constituent. `Keyed<T, K>` resolves to `T & { readonly [KEY]?: K }`; when
// exactly one non-brand constituent survives it IS T, so it is returned for
// normal derivation. A non-intersection type (or one with multiple non-brand
// constituents, out of scope) is returned unchanged.
func stripBrandMembers(t *shimchecker.Type, checker *shimchecker.Checker) *shimchecker.Type {
	if t.Flags()&shimchecker.TypeFlagsIntersection == 0 {
		return t
	}
	constituents := t.Types()
	nonBrand := make([]*shimchecker.Type, 0, len(constituents))
	for _, c := range constituents {
		if !isBrandObject(c, checker) {
			nonBrand = append(nonBrand, c)
		}
	}
	if len(nonBrand) == 1 {
		return nonBrand[0]
	}
	return t
}

// isBrandObject reports whether t is a phantom-brand object literal — an
// intersection constituent whose ONLY properties are computed-symbol brand
// properties (`{ readonly [KEY]?: K }`). A real user type declares named
// members, so this cannot misfire on T itself.
func isBrandObject(t *shimchecker.Type, checker *shimchecker.Checker) bool {
	props := checker.GetPropertiesOfType(t)
	if len(props) == 0 {
		return false
	}
	for _, prop := range props {
		if !isAnyBrandProperty(prop) {
			return false
		}
	}
	return true
}

// isAnyBrandProperty reports whether a property symbol is a computed-symbol
// signature `readonly [NAME]?: K` whose NAME identifier is one of the known
// phantom brands.
func isAnyBrandProperty(prop *shimast.Symbol) bool {
	for _, decl := range prop.Declarations {
		if decl.Kind != shimast.KindPropertySignature {
			continue
		}
		name := decl.Name()
		if name == nil || name.Kind != shimast.KindComputedPropertyName {
			continue
		}
		expr := name.AsComputedPropertyName().Expression
		if expr == nil || expr.Kind != shimast.KindIdentifier {
			continue
		}
		if brandPropertyNames[expr.Text()] {
			return true
		}
	}
	return false
}

// brandLiteralFor walks a type's properties for one declared as a
// computed-symbol optional property whose declaring const is named propName,
// then extracts the literal payload from that property's type. The checker
// flattens intersections, so a constrained brand (`Entity & { [HOLE]?: 2 }`)
// works. The first property whose payload extracts wins.
func brandLiteralFor[T any](
	t *shimchecker.Type,
	checker *shimchecker.Checker,
	propName string,
	extract func(*shimchecker.Type) (T, bool),
) (T, bool) {
	var zero T
	for _, prop := range checker.GetPropertiesOfType(t) {
		if !isBrandProperty(prop, propName) {
			continue
		}
		propType := checker.GetTypeOfSymbol(prop)
		if propType == nil {
			continue
		}
		if value, ok := extract(propType); ok {
			return value, true
		}
	}
	return zero, false
}

// isBrandProperty reports whether a property symbol is declared as a
// computed-property signature `readonly [NAME]?: K` referencing an identifier
// named propName — the shape both brands share.
func isBrandProperty(prop *shimast.Symbol, propName string) bool {
	for _, decl := range prop.Declarations {
		if decl.Kind != shimast.KindPropertySignature {
			continue
		}
		name := decl.Name()
		if name == nil || name.Kind != shimast.KindComputedPropertyName {
			continue
		}
		expr := name.AsComputedPropertyName().Expression
		if expr == nil || expr.Kind != shimast.KindIdentifier {
			continue
		}
		if expr.Text() == propName {
			return true
		}
	}
	return false
}

// extractStringLiteral pulls the string-literal payload K out of a brand
// property's type (`K` or `K | undefined`).
func extractStringLiteral(propType *shimchecker.Type) (string, bool) {
	if s, ok := stringLiteralValue(propType); ok {
		return s, true
	}
	if propType.Flags()&shimchecker.TypeFlagsUnion != 0 {
		for _, member := range propType.Types() {
			if s, ok := stringLiteralValue(member); ok {
				return s, true
			}
		}
	}
	return "", false
}

// extractNumberLiteral pulls the number-literal payload N out of a brand
// property's type (`N` or `N | undefined`).
func extractNumberLiteral(propType *shimchecker.Type) (int, bool) {
	if n, ok := numberLiteralValue(propType); ok {
		return n, true
	}
	if propType.Flags()&shimchecker.TypeFlagsUnion != 0 {
		for _, member := range propType.Types() {
			if n, ok := numberLiteralValue(member); ok {
				return n, true
			}
		}
	}
	return 0, false
}

func stringLiteralValue(t *shimchecker.Type) (string, bool) {
	if t.Flags()&shimchecker.TypeFlagsStringLiteral == 0 {
		return "", false
	}
	if s, ok := t.AsLiteralType().Value().(string); ok {
		return s, true
	}
	return "", false
}

// numberLiteralValue reads a number literal's integer value without importing
// the internal jsnum type: its String()/%v render is JS-canonical, so a
// hole/index literal (`1`, `2`, …) round-trips through strconv.
func numberLiteralValue(t *shimchecker.Type) (int, bool) {
	if t.Flags()&shimchecker.TypeFlagsNumberLiteral == 0 {
		return 0, false
	}
	text := fmt.Sprintf("%v", t.AsLiteralType().Value())
	n, err := strconv.Atoi(text)
	if err != nil {
		return 0, false
	}
	return n, true
}

// LiteralKind tags a Rule-2 singular value.
type LiteralKind int

const (
	// LiteralUndefined is the `void`/`undefined` singleton (`void 0`).
	LiteralUndefined LiteralKind = iota
	// LiteralNull is the `null` singleton.
	LiteralNull
	// LiteralString is a string literal.
	LiteralString
	// LiteralNumber is a numeric literal.
	LiteralNumber
	// LiteralBigInt is a bigint literal.
	LiteralBigInt
	// LiteralBoolean is a boolean literal.
	LiteralBoolean
)

// LiteralValue is a Rule-2 singular value: a literal supplied directly rather
// than resolved through a token. Number/BigInt carry the sign separately and
// Text is the unsigned magnitude (bigint WITHOUT the trailing `n`), so rendering
// reproduces the reference `-<magnitude>` unary-minus shape.
type LiteralValue struct {
	Kind    LiteralKind
	Str     string
	Text    string
	Negated bool
	Bool    bool
}

// SingletonValue detects a Rule-2 singular type and returns its value: a string /
// number / bigint / boolean literal, or the whole-type `void`/`undefined`/`null`
// singletons. A union or the wide `boolean` scalar returns ok=false, so the
// caller tokenizes instead.
func SingletonValue(t *shimchecker.Type) (LiteralValue, bool) {
	flags := t.Flags()
	if flags&shimchecker.TypeFlagsUnion != 0 {
		return LiteralValue{}, false
	}
	// Wide boolean (`false | true`) carries the Boolean flag without a literal
	// flag — a scalar token, not a singular value.
	if flags&shimchecker.TypeFlagsBoolean != 0 && flags&shimchecker.TypeFlagsBooleanLiteral == 0 {
		return LiteralValue{}, false
	}
	if s, ok := stringLiteralValue(t); ok {
		return LiteralValue{Kind: LiteralString, Str: s}, true
	}
	if flags&shimchecker.TypeFlagsNumberLiteral != 0 {
		text := fmt.Sprintf("%v", t.AsLiteralType().Value())
		negated := strings.HasPrefix(text, "-")
		return LiteralValue{Kind: LiteralNumber, Text: strings.TrimPrefix(text, "-"), Negated: negated}, true
	}
	if flags&shimchecker.TypeFlagsBigIntLiteral != 0 {
		text := fmt.Sprintf("%v", t.AsLiteralType().Value())
		negated := strings.HasPrefix(text, "-")
		return LiteralValue{Kind: LiteralBigInt, Text: strings.TrimPrefix(text, "-"), Negated: negated}, true
	}
	if flags&shimchecker.TypeFlagsBooleanLiteral != 0 {
		// A boolean literal's data is a *LiteralType whose Value() is a Go bool,
		// NOT an *IntrinsicType — AsIntrinsicType() here would panic.
		value, _ := t.AsLiteralType().Value().(bool)
		return LiteralValue{Kind: LiteralBoolean, Bool: value}, true
	}
	if flags&(shimchecker.TypeFlagsVoid|shimchecker.TypeFlagsUndefined) != 0 {
		return LiteralValue{Kind: LiteralUndefined}, true
	}
	if flags&shimchecker.TypeFlagsNull != 0 {
		return LiteralValue{Kind: LiteralNull}, true
	}
	return LiteralValue{}, false
}

// IsPureLiteralUnion reports whether a type is a union whose every member is a
// literal — a discriminated choice that renders one sorted token, not a slot
// union. Wide boolean (`false | true`) is excluded.
func IsPureLiteralUnion(t *shimchecker.Type) bool {
	if t.Flags()&shimchecker.TypeFlagsBoolean != 0 {
		return false
	}
	if t.Flags()&shimchecker.TypeFlagsUnion == 0 {
		return false
	}
	for _, member := range t.Types() {
		if _, ok := literalText(member); !ok {
			return false
		}
	}
	return true
}

// LiteralUnionTokenForOptional renders the sorted literal-union token over just
// the non-nullish members of an optional pure-literal union
// (`"a" | "b" | undefined` -> `"a" | "b"`), or ok=false when the type is not
// such a union. Wide `boolean | undefined` is excluded so it tokenizes as the
// scalar `boolean`.
func LiteralUnionTokenForOptional(t *shimchecker.Type) (string, bool) {
	if t.Flags()&shimchecker.TypeFlagsUnion == 0 {
		return "", false
	}
	nullish := shimchecker.TypeFlagsUndefined | shimchecker.TypeFlagsNull | shimchecker.TypeFlagsVoid
	nonNullish := make([]*shimchecker.Type, 0, len(t.Types()))
	for _, member := range t.Types() {
		if member.Flags()&nullish == 0 {
			nonNullish = append(nonNullish, member)
		}
	}
	if len(nonNullish) < 2 {
		return "", false
	}
	allBooleanLiteral := true
	for _, member := range nonNullish {
		if member.Flags()&shimchecker.TypeFlagsBooleanLiteral == 0 {
			allBooleanLiteral = false
			break
		}
	}
	if allBooleanLiteral {
		return "", false
	}
	parts := make([]string, 0, len(nonNullish))
	for _, member := range nonNullish {
		text, ok := literalText(member)
		if !ok {
			return "", false
		}
		parts = append(parts, text)
	}
	sort.Strings(parts)
	return strings.Join(parts, " | "), true
}

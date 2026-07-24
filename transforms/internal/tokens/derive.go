package tokens

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokentext"
)

// collectionTokenBases are the default-lib collection wrappers whose token keeps
// only the element type argument (`Array<elem>` / `Iterable<elem>`).
var collectionTokenBases = map[string]bool{"Array": true, "Iterable": true}

// This file holds the shared token-derivation helpers (intrinsic / literal / base
// / generic-argument rendering) that DeriveTokenF (holes.go) composes into the ONE
// derivation the engine uses. The former plain, non-hole-aware DeriveToken was
// removed in W6p3 with its last caller (the deleted di_options stage); DeriveTokenF
// is byte-identical to it for a closed (hole-free) type and is now the sole entry.

// intrinsicToken returns the bare token for an intrinsic type (string / number /
// boolean / symbol / bigint / any / unknown / void / never), or ok=false for a
// non-intrinsic type. Boolean literals and the nullish singletons null /
// undefined / void are excluded so they fall through to literal / singleton
// handling.
func intrinsicToken(t *shimchecker.Type) (string, bool) {
	flags := t.Flags()
	if flags&shimchecker.TypeFlagsIntrinsic == 0 {
		return "", false
	}
	if flags&shimchecker.TypeFlagsBooleanLiteral != 0 {
		return "", false
	}
	if flags&(shimchecker.TypeFlagsNull|shimchecker.TypeFlagsUndefined|shimchecker.TypeFlagsVoid) != 0 {
		return "", false
	}
	name := t.AsIntrinsicType().IntrinsicName()
	if name == "" {
		return "", false
	}
	return name, true
}

// literalToken renders a single literal type or a pure-literal union as its
// deterministic token, or ok=false for a non-literal type. Union members are
// rendered as valid TS, sorted, and ` | `-joined. Wide boolean (the false | true
// union) is excluded so it tokenizes as the bare scalar "boolean".
func literalToken(t *shimchecker.Type) (string, bool) {
	flags := t.Flags()
	if flags&shimchecker.TypeFlagsBoolean != 0 && flags&shimchecker.TypeFlagsBooleanLiteral == 0 {
		return "", false
	}
	if text, ok := literalText(t); ok {
		return text, true
	}
	if flags&shimchecker.TypeFlagsUnion != 0 {
		members := t.Types()
		parts := make([]string, 0, len(members))
		for _, member := range members {
			text, ok := literalText(member)
			if !ok {
				return "", false
			}
			parts = append(parts, text)
		}
		if len(parts) == 0 {
			return "", false
		}
		sort.Strings(parts)
		return strings.Join(parts, " | "), true
	}
	return "", false
}

// literalText renders a single literal type as its valid-TS text (string
// JSON-quoted, number/bigint/boolean by value), or ok=false when the type is not
// a renderable literal.
func literalText(t *shimchecker.Type) (string, bool) {
	flags := t.Flags()
	if flags&shimchecker.TypeFlagsStringLiteral != 0 {
		if s, ok := t.AsLiteralType().Value().(string); ok {
			return strconv.Quote(s), true
		}
	}
	if flags&shimchecker.TypeFlagsNumberLiteral != 0 {
		// jsnum.Number renders through its own String(); %v defers to it.
		return fmt.Sprintf("%v", t.AsLiteralType().Value()), true
	}
	if flags&shimchecker.TypeFlagsBigIntLiteral != 0 {
		return fmt.Sprintf("%vn", t.AsLiteralType().Value()), true
	}
	if flags&shimchecker.TypeFlagsBooleanLiteral != 0 {
		// Boolean literal data is a *LiteralType (Go bool value), not an
		// *IntrinsicType; FormatBool reproduces the "true"/"false" text.
		b, _ := t.AsLiteralType().Value().(bool)
		return strconv.FormatBool(b), true
	}
	return "", false
}

// genericTypeArguments returns the type arguments a generic reference was applied
// with, or nil for a non-generic (or alias-winning) type.
//
// An alias instantiation is keyed on its ALIAS arguments, not the underlying
// reference's: a bare alias (`type UserRepo = IRepository<User>`) tokenizes with
// NO args even though the reference underneath sees `[User]`. A defaults-only
// alias instantiation normalizes to the bare alias too — the checker records
// `aliasTypeArguments` for a bare reference to a defaulted-generic alias
// (`type SM<S = "singleton"> = …`) inconsistently (defaults pre-applied for a
// same-file reference, absent for an imported one), yet both spell the identical
// type and must derive the identical token, so every argument equal to its
// parameter's declared default drops out.
func genericTypeArguments(ctx *Context, t *shimchecker.Type) []*shimchecker.Type {
	if alias := aliasOf(t); alias != nil && alias.symbol != nil {
		args := alias.typeArguments
		if len(args) == 0 {
			return nil
		}
		if aliasArgsAreDeclaredDefaults(ctx, alias.symbol, args) {
			return nil
		}
		return args
	}
	if t.Flags()&shimchecker.TypeFlagsObject == 0 {
		return nil
	}
	if t.ObjectFlags()&shimchecker.ObjectFlagsReference == 0 {
		return nil
	}
	args := ctx.Checker.GetTypeArguments(t)
	if len(args) == 0 {
		return nil
	}
	return args
}

// aliasArgsAreDeclaredDefaults reports whether args is exactly the declared
// parameter-default list of the alias — i.e. the instantiation is
// indistinguishable from the bare alias. Compares by checker type identity: the
// type of the declared default node is the interned type object the checker also
// records as the applied argument. Any parameter without a default, an arity
// mismatch, or a single non-default argument means arguments were genuinely
// applied.
func aliasArgsAreDeclaredDefaults(ctx *Context, aliasSymbol *shimast.Symbol, args []*shimchecker.Type) bool {
	var decl *shimast.Node
	for _, d := range aliasSymbol.Declarations {
		if d.Kind == shimast.KindTypeAliasDeclaration {
			decl = d
			break
		}
	}
	if decl == nil {
		return false
	}
	parameters := decl.TypeParameters()
	if len(parameters) != len(args) {
		return false
	}
	for i, arg := range args {
		defaultNode := parameters[i].AsTypeParameterDeclaration().DefaultType
		if defaultNode == nil {
			return false
		}
		if ctx.Checker.GetTypeFromTypeNode(defaultNode) != arg {
			return false
		}
	}
	return true
}

// primaryDeclaration picks the declaration a token anchors on, preferring an
// interface / class / type-alias / enum declaration over the first available.
func primaryDeclaration(symbol *shimast.Symbol) *shimast.Node {
	decls := symbol.Declarations
	if len(decls) == 0 {
		return nil
	}
	for _, d := range decls {
		switch d.Kind {
		case shimast.KindInterfaceDeclaration,
			shimast.KindClassDeclaration,
			shimast.KindTypeAliasDeclaration,
			shimast.KindEnumDeclaration:
			return d
		}
	}
	return decls[0]
}

// baseTokenFor renders the base token `<source>:<exportName>` for a named
// symbol. A default-lib type tokenizes as its bare symbol name.
func baseTokenFor(ctx *Context, symbol *shimast.Symbol, sourceFile *shimast.SourceFile) string {
	if ctx.IsDefaultLib != nil && ctx.IsDefaultLib(sourceFile) {
		return symbol.Name
	}
	exportName := qualifiedExportName(symbol)
	declPath := sourceFile.FileName()
	pkg := nearestPackage(ctx, declPath)
	if pkg != nil {
		if spec, ok := publicImportSpecifier(ctx, pkg, symbol, sourceFile); ok {
			return spec + ":" + exportName
		}
		return tokentext.PackagePrivateToken(pkg.name, pkg.dir, declPath, exportName)
	}
	return tokentext.RootlessToken(declPath, exportName, ctx.ProjectRoot)
}

// qualifiedExportName is the module-qualified declared name of a symbol: bare for
// a top-level type, dotted (`A.Foo`) for a type nested in a namespace. The walk
// stops at the source-file module symbol.
func qualifiedExportName(symbol *shimast.Symbol) string {
	name := symbol.Name
	parent := symbol.Parent
	for parent != nil && !isSourceFileModuleSymbol(parent) {
		name = parent.Name + "." + name
		parent = parent.Parent
	}
	return name
}

// topLevelAncestor is the outermost declaration ancestor directly owned by a
// source-file module — the symbol itself for a top-level type, the enclosing
// namespace symbol otherwise.
func topLevelAncestor(symbol *shimast.Symbol) *shimast.Symbol {
	current := symbol
	parent := symbol.Parent
	for parent != nil && !isSourceFileModuleSymbol(parent) {
		current = parent
		parent = parent.Parent
	}
	return current
}

func isSourceFileModuleSymbol(symbol *shimast.Symbol) bool {
	for _, d := range symbol.Declarations {
		if d.Kind == shimast.KindSourceFile {
			return true
		}
	}
	return false
}

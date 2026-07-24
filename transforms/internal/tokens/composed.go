package tokens

import (
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/fnioc/std/transforms/internal/tokentext"
)

// ComposedTokenForSymbol derives the token for a SPELLED generic type reference
// whose base names an imported symbol and whose type arguments are already bound
// to checker types — e.g. the `IOptions<T>` a sugar body writes as
// `tokenfor<IOptions<T>>()`, where `IOptions` is a body-external import and `T`
// binds from the call-site env.
//
// It is the symbol-driven twin of DeriveTokenF's own base<args> composition
// (derive.go:83 / holes.go): the base token derives from baseSymbol through the
// shared baseTokenFor, and each argument token recurses through DeriveTokenF, so a
// closed generic composes byte-identically to the token DeriveTokenF would mint
// for the same instantiated type. ok=false when an argument yields no token (an
// anonymous / unnameable type) — the caller turns that into a hard diagnostic,
// exactly as the bespoke options stage did for an anonymous element.
func ComposedTokenForSymbol(ctx *Context, baseSymbol *shimast.Symbol, args []*shimchecker.Type) (string, bool) {
	if baseSymbol == nil {
		return "", false
	}
	decl := primaryDeclaration(baseSymbol)
	if decl == nil {
		return "", false
	}
	sourceFile := shimast.GetSourceFileOfNode(decl)
	if sourceFile == nil {
		return "", false
	}
	base := baseTokenFor(ctx, baseSymbol, sourceFile)
	if len(args) == 0 {
		return base, true
	}
	if collectionTokenBases[base] && len(args) > 1 {
		args = args[:1]
	}
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		token, ok := DeriveTokenF(ctx, arg, nil)
		if !ok {
			return "", false
		}
		parts = append(parts, token)
	}
	return base + "<" + strings.Join(parts, ",") + ">", true
}

// ResolveExportedSymbol finds the symbol a package named pkgName exports as
// exportName, by scanning the program's loaded source files for one owned by that
// package whose module exports the name (re-export aliases resolved to the real
// declaration). ok=false when the package is not loaded in the program or does
// not export the name.
//
// It generalizes the bespoke options stage's witness scan (resolveOptionsBase):
// that scan hardcoded `@rhombus-std/options` + `IOptions` and returned a fixed
// base-token string; this returns the SYMBOL, so ComposedTokenForSymbol derives
// the real public specifier through baseTokenFor. Anchoring on the LOADED file
// (not an import-specifier node) matches exactly where the old stage succeeded:
// wherever a program had the options package loaded — which the owner guarantee
// makes true wherever a body referencing it compiled — the symbol resolves here.
func ResolveExportedSymbol(ctx *Context, sourceFiles []*shimast.SourceFile, pkgName, exportName string) (*shimast.Symbol, bool) {
	if ctx.ReadFile == nil {
		return nil, false
	}
	for _, sf := range sourceFiles {
		pkg := nearestPackage(ctx, tokentext.Normalize(sf.FileName()))
		if pkg == nil || pkg.name != pkgName {
			continue
		}
		module := ctx.Checker.GetSymbolAtLocation(sf.AsNode())
		if module == nil {
			continue
		}
		for _, exported := range ctx.Checker.GetExportsOfModule(module) {
			if exported.Name != exportName {
				continue
			}
			resolved := exported
			if exported.Flags&shimast.SymbolFlagsAlias != 0 {
				if aliased := ctx.Checker.GetAliasedSymbol(exported); aliased != nil {
					resolved = aliased
				}
			}
			return resolved, true
		}
	}
	return nil, false
}

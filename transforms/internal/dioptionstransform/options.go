package dioptionstransform

import (
	shimast "github.com/microsoft/typescript-go/shim/ast"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/tokentext"
)

// The canonical base token of the package-public `Options<T>`. It is the value
// the wrapper token is built over, and — because a package-public root export of
// a package named `@rhombus-std/options` is the ONLY way that base can arise — it
// also names exactly what `resolveOptionsBase` looks for. The emitted wrapper is
// always `optionsBaseToken<element>`.
const optionsBaseToken = "@rhombus-std/options:Options"

const (
	optionsPackageName = "@rhombus-std/options"
	optionsExportName  = "Options"
)

// packageInfo is a package the resolver walked to: its declared name, its
// directory, and its parsed package.json (for the export map).
type packageInfo struct {
	name string
	dir  string
	json tokentext.PackageJSON
}

// resolveOptionsBase locates the package-public `Options<T>` in the program and
// returns its base token, or ok=false when it is absent (the caller then leaves
// every sugar call in place with a diagnostic).
//
// A package-public `Options` base is `@rhombus-std/options:Options` exactly when
// a generic interface named `Options` is reachable through the ROOT export of a
// package named `@rhombus-std/options` — which is what this scan checks against
// the checker export graph (so a barrel that re-exports a deeply-declared
// `Options` still resolves, and a user type of the same name in another package
// does not).
func resolveOptionsBase(prog *driver.Program, ctx *tokens.Context) (string, bool) {
	if ctx.ReadFile == nil {
		return "", false
	}
	checker := ctx.Checker
	cache := map[string]*packageInfo{}

	for _, sf := range prog.TSProgram.GetSourceFiles() {
		pkg := nearestPackage(ctx, cache, tokentext.Normalize(sf.FileName()))
		if pkg == nil || pkg.name != optionsPackageName {
			continue
		}
		if !isRootExportTarget(pkg, sf) {
			continue
		}
		module := checker.GetSymbolAtLocation(sf.AsNode())
		if module == nil {
			continue
		}
		for _, exported := range checker.GetExportsOfModule(module) {
			if exported.Name != optionsExportName {
				continue
			}
			resolved := exported
			if exported.Flags&shimast.SymbolFlagsAlias != 0 {
				if aliased := checker.GetAliasedSymbol(exported); aliased != nil {
					resolved = aliased
				}
			}
			if isGenericInterface(resolved) {
				return optionsBaseToken, true
			}
		}
	}
	return "", false
}

// isRootExportTarget reports whether sf is the on-disk target of the package's
// ROOT (`.`) export entry, matched by extension-stripped path. The match runs
// against tokentext.EntrySourceStems — the same build-state-independent candidate
// set (literal target, then the `dist/<X> -> src/<X>` twin) the general token
// derivation resolves through (parity, decisions §41). Without the twin, a
// dist-referenced `@rhombus-std/options` compiling ITSELF — dist not built, so
// the loaded root entry is `src/index.ts`, not the `dist/index` target — would
// fail this check, resolveOptionsBase would return absent, and every
// `addOptions<T>()` would be left unlowered while the TS engine (which routes
// through the fixed publicImportSpecifier) lowers it: a byte-parity break.
func isRootExportTarget(pkg *packageInfo, sf *shimast.SourceFile) bool {
	target := tokentext.StripExt(tokentext.Normalize(sf.FileName()))
	for _, entry := range tokentext.CollectExportEntries(pkg.json) {
		if entry.Subpath != "" {
			continue
		}
		for _, stem := range tokentext.EntrySourceStems(pkg.dir, entry) {
			if stem == target {
				return true
			}
		}
	}
	return false
}

// isGenericInterface reports whether a symbol declares an interface with at least
// one type parameter.
func isGenericInterface(symbol *shimast.Symbol) bool {
	for _, decl := range symbol.Declarations {
		if decl.Kind == shimast.KindInterfaceDeclaration && len(decl.TypeParameters()) > 0 {
			return true
		}
	}
	return false
}

// nearestPackage walks up from a path to the nearest readable, named package.json,
// caching the result per directory. It mirrors the shared token core's own
// package discovery; a private copy lives here because that core is read-only and
// exposes no base-token-from-symbol entry.
func nearestPackage(ctx *tokens.Context, cache map[string]*packageInfo, fromPath string) *packageInfo {
	dir := tokentext.Dirname(fromPath)
	for {
		if cached, seen := cache[dir]; seen {
			if cached != nil {
				return cached
			}
		} else {
			var resolved *packageInfo
			if text, ok := ctx.ReadFile(dir + "/package.json"); ok {
				if json, ok := tokentext.ParsePackageJSON(text); ok {
					resolved = &packageInfo{name: json.Name, dir: dir, json: json}
				}
			}
			cache[dir] = resolved
			if resolved != nil {
				return resolved
			}
		}
		parent := tokentext.Dirname(dir)
		if parent == dir {
			return nil
		}
		dir = parent
	}
}

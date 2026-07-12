package tokens

import (
	"sort"
	"strings"

	shimast "github.com/microsoft/typescript-go/shim/ast"

	"github.com/fnioc/std/transforms/internal/tokentext"
)

// nearestPackage walks up from a declaration path to the nearest readable, named
// package.json, caching the result per directory.
func nearestPackage(ctx *Context, fromPath string) *packageInfo {
	if ctx.ReadFile == nil {
		return nil
	}
	cache := ctx.cache()
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

// publicImportSpecifier returns the exact import specifier a consumer writes for
// a symbol reachable through a package's public exports (`pkg` for a root export,
// `pkg/contracts` for a subpath), or ok=false when the type is private to the
// package. The match is against the checker export graph, not file-path stems.
func publicImportSpecifier(ctx *Context, pkg *packageInfo, symbol *shimast.Symbol, _ *shimast.SourceFile) (string, bool) {
	if ctx.SourceFileAtStem == nil {
		return "", false
	}
	target := topLevelAncestor(symbol)
	targetDecls := map[*shimast.Node]bool{}
	for _, d := range target.Declarations {
		targetDecls[d] = true
	}
	if len(targetDecls) == 0 {
		return "", false
	}
	var declFile *shimast.SourceFile
	if primary := primaryDeclaration(target); primary != nil {
		declFile = shimast.GetSourceFileOfNode(primary)
	}

	type match struct {
		subpath         string
		targetsDeclFile bool
	}
	matches := []match{}
	for _, entry := range tokentext.CollectExportEntries(pkg.json) {
		sf := entrySourceFile(pkg, entry, ctx.SourceFileAtStem)
		if sf == nil {
			continue
		}
		mod := ctx.Checker.GetSymbolAtLocation(sf.AsNode())
		if mod == nil {
			continue
		}
		for _, exp := range ctx.Checker.GetExportsOfModule(mod) {
			resolved := exp
			if exp.Flags&shimast.SymbolFlagsAlias != 0 {
				if aliased := ctx.Checker.GetAliasedSymbol(exp); aliased != nil {
					resolved = aliased
				}
			}
			shares := false
			for _, d := range resolved.Declarations {
				if targetDecls[d] {
					shares = true
					break
				}
			}
			if shares {
				matches = append(matches, match{subpath: entry.Subpath, targetsDeclFile: sf == declFile})
				break
			}
		}
	}
	if len(matches) == 0 {
		return "", false
	}

	sort.SliceStable(matches, func(i, j int) bool {
		a, b := matches[i], matches[j]
		if a.targetsDeclFile != b.targetsDeclFile {
			return a.targetsDeclFile
		}
		if len(a.subpath) != len(b.subpath) {
			return len(a.subpath) < len(b.subpath)
		}
		return a.subpath < b.subpath
	})
	best := matches[0]
	if best.subpath == "" {
		return pkg.name, true
	}
	return pkg.name + "/" + best.subpath, true
}

// entrySourceFile resolves an export entry's on-disk target to the source file
// the PROGRAM actually loaded for it — the load-bearing fix for
// build-state-independent tokens. Two candidate stems are tried, in order:
//
//  1. The LITERAL target stem (`<pkg>/dist/index` from `./dist/index.js`, or
//     `<pkg>/index` from a raw `./index.js`). This is what a CONSUMER compiling
//     against the package's built dist loads, and what a src-referenced package
//     compiling itself loads when a `source`/`types`/`bun` condition points at
//     `src`.
//  2. The `src/` TWIN of a `dist/` target (`<pkg>/dist/<X>` -> `<pkg>/src/<X>`),
//     per scripts/build-lib.ts's `dist/<X>.js <-> src/<X>.ts` convention. This
//     is what a DIST-referenced package compiling ITSELF loads: its own dist is
//     not built yet, so candidate 1 is absent from the program, but the SOURCE
//     entry (`src/index.ts`, pulled in by tsconfig `include`) is present.
//
// Because the SAME GetExportsOfModule membership check then runs against the
// resolved entry module either way, the derived token is byte-identical in every
// compilation context — the whole point of the fix. Candidate 1 is always tried
// first, so any context in which the literal target is loaded is unaffected.
// Mirrors the TS engine's entrySourceFile (libraries/primitives.transformer/src/tokens.ts).
func entrySourceFile(
	pkg *packageInfo,
	entry tokentext.ExportEntry,
	sourceFileAtStem func(stem string) *shimast.SourceFile,
) *shimast.SourceFile {
	literalStem := tokentext.StripExt(entry.TargetRel)
	if direct := sourceFileAtStem(pkg.dir + "/" + literalStem); direct != nil {
		return direct
	}
	// The `src/` twin of a `dist/`-rooted target — the package's own source entry
	// when its dist is not yet built (self-compilation of a dist-referenced pkg).
	const distPrefix = "dist/"
	if strings.HasPrefix(literalStem, distPrefix) {
		if rest := literalStem[len(distPrefix):]; rest != "" {
			return sourceFileAtStem(pkg.dir + "/src/" + rest)
		}
	}
	return nil
}

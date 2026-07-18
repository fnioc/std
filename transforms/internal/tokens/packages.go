package tokens

import (
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
// a symbol reachable through a package's public exports. Only two subpaths yield
// a stable public specifier: the barrel `.` (→ bare `pkg`) and `./tokens/*`
// (→ `pkg/tokens/<path>`, the source-referenced token surface). A type reachable
// through the exports but ONLY via some other named subpath has no derivable
// public specifier — that is a hard diagnostic (via ctx.Diag), because a friendly
// alias subpath must not silently become part of a token. ok=false means the type
// is not publicly reachable at all and falls to the app-internal token. The match
// is against the checker export graph, not file-path stems.
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

	// Classify every export subpath the target is re-exported from into the three
	// buckets the strict rule cares about. No tiebreak: the barrel always wins,
	// then a `./tokens/*` subpath, and any other reachable subpath is a violation.
	var hasBarrel bool
	var tokensSubpath string
	var otherSubpath string
	for _, entry := range tokentext.CollectExportEntries(pkg.json) {
		sf := entrySourceFile(pkg, entry, ctx.SourceFileAtStem)
		if sf == nil {
			continue
		}
		mod := ctx.Checker.GetSymbolAtLocation(sf.AsNode())
		if mod == nil {
			continue
		}
		shares := false
		for _, exp := range ctx.Checker.GetExportsOfModule(mod) {
			resolved := exp
			if exp.Flags&shimast.SymbolFlagsAlias != 0 {
				if aliased := ctx.Checker.GetAliasedSymbol(exp); aliased != nil {
					resolved = aliased
				}
			}
			for _, d := range resolved.Declarations {
				if targetDecls[d] {
					shares = true
					break
				}
			}
			if shares {
				break
			}
		}
		if !shares {
			continue
		}
		switch {
		case entry.Subpath == "":
			hasBarrel = true
		case entry.Subpath == "tokens" || strings.HasPrefix(entry.Subpath, "tokens/"):
			if tokensSubpath == "" || sf == declFile {
				tokensSubpath = entry.Subpath
			}
		default:
			if otherSubpath == "" {
				otherSubpath = entry.Subpath
			}
		}
	}

	if hasBarrel {
		return pkg.name, true
	}
	if tokensSubpath != "" {
		return pkg.name + "/" + tokensSubpath, true
	}
	if otherSubpath != "" {
		reportNonPublicSubpath(ctx, target, declFile, pkg, otherSubpath)
	}
	return "", false
}

// reportNonPublicSubpath fires ctx.Diag for a type reachable only via a named
// export subpath that is neither the barrel nor `./tokens/*`. Anchored at the
// type's own declaration so the message points at the file whose exports must
// change. Naming both fixes keeps the remedy unambiguous.
func reportNonPublicSubpath(ctx *Context, target *shimast.Symbol, declFile *shimast.SourceFile, pkg *packageInfo, subpath string) {
	if ctx.Diag == nil || declFile == nil {
		return
	}
	primary := primaryDeclaration(target)
	if primary == nil {
		return
	}
	ctx.Diag(
		declFile.FileName(),
		primary.Pos(),
		"TOKEN_SUBPATH_NOT_PUBLIC",
		"cannot derive a token for \""+target.Name+"\": it is reachable from \""+pkg.name+
			"\" only through the \"./"+subpath+"\" export subpath, which is neither the package "+
			"barrel nor \"./tokens/*\". Export it from the barrel (the package's main index), or "+
			"expose its file through a \"./tokens/*\" subpath, so the derived token has a stable "+
			"public import specifier.",
	)
}

// entrySourceFile resolves an export entry's on-disk target to the source file
// the PROGRAM actually loaded for it — the load-bearing fix for
// build-state-independent tokens. The candidate stems (literal target first,
// then the `dist/<X> -> src/<X>` twin) come from tokentext.EntrySourceStems, the
// shared convention this and dioptionstransform's isRootExportTarget both key on
// so the two Go call sites cannot drift; see that helper for the full rationale.
//
// Because the SAME GetExportsOfModule membership check then runs against the
// resolved entry module either way, the derived token is byte-identical in every
// compilation context. The literal stem is always tried first, so any context in
// which the literal target is loaded is unaffected.
// Mirrors the TS engine's entrySourceFile (libraries/primitives.transformer/src/tokens.ts).
func entrySourceFile(
	pkg *packageInfo,
	entry tokentext.ExportEntry,
	sourceFileAtStem func(stem string) *shimast.SourceFile,
) *shimast.SourceFile {
	for _, stem := range tokentext.EntrySourceStems(pkg.dir, entry) {
		if sf := sourceFileAtStem(stem); sf != nil {
			return sf
		}
	}
	return nil
}

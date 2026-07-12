package tokentext

import (
	"encoding/json"
	"strings"
)

// PackageJSON is the subset of a package manifest the export-graph flattening
// reads. `Exports` stays untyped because it may be a string, a conditions
// object, or a subpath map.
type PackageJSON struct {
	Name    string          `json:"name"`
	Main    string          `json:"main"`
	Module  string          `json:"module"`
	Types   string          `json:"types"`
	Typings string          `json:"typings"`
	Exports json.RawMessage `json:"exports"`
}

// ExportEntry is one flattened public entry point: a public `Subpath` ("" for
// the root, else e.g. "contracts") paired with the on-disk `TargetRel` it
// resolves to, relative to the package dir (leading "./" stripped).
type ExportEntry struct {
	Subpath   string
	TargetRel string
}

// EntrySourceStems returns, in resolution-priority order, the extension-stripped
// absolute path stems an export entry's on-disk target may resolve to in the
// program. It is the single shared convention both Go token-derivation call
// sites use — publicImportSpecifier's entrySourceFile (the general token
// derivation) and dioptionstransform's isRootExportTarget (the Options<T> base
// scan) — so the two cannot drift (parity, decisions §41). The candidates are:
//
//  1. The LITERAL target stem (`<pkgDir>/dist/index` from `./dist/index.js`, or
//     `<pkgDir>/index` from a raw `./index.js`) — what a CONSUMER of the built
//     dist, or a src-referenced package compiling itself, loads.
//  2. The `src/` TWIN of a `dist/`-rooted target (`<pkgDir>/dist/<X>` ->
//     `<pkgDir>/src/<X>`, per scripts/build-lib.ts's convention) — what a
//     DIST-referenced package compiling ITSELF loads, its own dist not yet built.
//
// Mirrors the TS engine's entrySourceFile
// (libraries/primitives.transformer/src/tokens.ts).
func EntrySourceStems(pkgDir string, entry ExportEntry) []string {
	literalStem := StripExt(entry.TargetRel)
	stems := []string{pkgDir + "/" + literalStem}
	const distPrefix = "dist/"
	if strings.HasPrefix(literalStem, distPrefix) {
		if rest := literalStem[len(distPrefix):]; rest != "" {
			stems = append(stems, pkgDir+"/src/"+rest)
		}
	}
	return stems
}

// ParsePackageJSON decodes the manifest subset, returning ok=false for malformed
// JSON or a nameless package (both treated as "no owning package" up-tree).
func ParsePackageJSON(text string) (PackageJSON, bool) {
	var pkg PackageJSON
	if err := json.Unmarshal([]byte(text), &pkg); err != nil {
		return PackageJSON{}, false
	}
	if pkg.Name == "" {
		return PackageJSON{}, false
	}
	return pkg, true
}

// CollectExportEntries flattens a package's public entry points into
// (subpath, targetRel) pairs. It reads `exports` (string / conditions / subpath
// map) and falls back to `main` / `module` / `types` / `typings`, finally to the
// conventional `index` when nothing else is declared.
func CollectExportEntries(pkg PackageJSON) []ExportEntry {
	out := []ExportEntry{}

	pushTarget := func(subKey string, target any) {
		subpath := subKey
		if subKey == "." {
			subpath = ""
		} else {
			subpath = trimDotSlash(subKey)
		}
		for _, t := range resolveConditionTargets(target) {
			out = append(out, ExportEntry{Subpath: subpath, TargetRel: trimDotSlash(t)})
		}
	}

	if len(pkg.Exports) > 0 {
		var raw any
		if err := json.Unmarshal(pkg.Exports, &raw); err == nil && raw != nil {
			switch exp := raw.(type) {
			case string:
				pushTarget(".", exp)
			case map[string]any:
				looksLikeSubpathMap := false
				for k := range exp {
					if k == "." || strings.HasPrefix(k, "./") {
						looksLikeSubpathMap = true
						break
					}
				}
				if looksLikeSubpathMap {
					for key, val := range exp {
						pushTarget(key, val)
					}
				} else {
					// A bare conditions object at the top level is the root entry.
					pushTarget(".", exp)
				}
			}
		}
	}

	for _, field := range []string{pkg.Main, pkg.Module, pkg.Types, pkg.Typings} {
		if field != "" {
			out = append(out, ExportEntry{Subpath: "", TargetRel: trimDotSlash(field)})
		}
	}
	if len(out) == 0 {
		out = append(out, ExportEntry{Subpath: "", TargetRel: "index"})
	}
	return out
}

// resolveConditionTargets resolves an exports condition value to its concrete
// string target(s), preferring the type/import channels and collecting every
// string leaf recursively.
func resolveConditionTargets(target any) []string {
	switch v := target.(type) {
	case string:
		return []string{v}
	case map[string]any:
		out := []string{}
		for _, key := range []string{"types", "import", "module", "default", "require", "node", "bun"} {
			leaf, ok := v[key]
			if !ok {
				continue
			}
			switch inner := leaf.(type) {
			case string:
				out = append(out, inner)
			case map[string]any:
				out = append(out, resolveConditionTargets(inner)...)
			}
		}
		return out
	}
	return nil
}

func trimDotSlash(s string) string {
	s = strings.TrimPrefix(s, ".")
	s = strings.TrimPrefix(s, "/")
	return s
}

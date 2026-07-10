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

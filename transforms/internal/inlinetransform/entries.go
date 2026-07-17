package inlinetransform

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// EntryKind classifies a publish-list entry by which fields it carries.
type EntryKind int

const (
	// KindMember is an interface-member sugar entry: type + impl + member all
	// present. The body lives on the impl export's member of the same name.
	KindMember EntryKind = iota
	// KindFunction is a free-function sugar entry: member absent. The token's
	// TypeName names the exported function itself, so type's TypeName == impl.
	KindFunction
)

// Kind infers the entry kind from field presence, per the owner schema. An
// entry that fits neither certified shape is reported as ok == false; the caller
// raises INLINE_ENTRY_SHAPE.
func (e Entry) Kind() (EntryKind, bool) {
	if e.Type == "" || e.Impl == "" {
		return 0, false
	}
	if e.Member != "" {
		// member present → interface-member sugar. member must differ from impl
		// (member == impl on a member entry is a malformed shape).
		if e.Member == e.Impl {
			return 0, false
		}
		return KindMember, true
	}
	// member absent → free function. The token's TypeName must name the export.
	_, typeName, ok := splitTypeToken(e.Type)
	if !ok || typeName != e.Impl {
		return 0, false
	}
	return KindFunction, true
}

// rawInlineConfig is the "rhombus.inline" object literal in a package.json.
type rawInlineConfig struct {
	Entries []Entry         `json:"entries"`
	Import  json.RawMessage `json:"import"` // string | []string | absent
}

// pkgJSONInline is a minimal package.json view exposing only the inline key.
type pkgJSONInline struct {
	Inline *rawInlineConfig `json:"rhombus.inline"`
}

// LoadInlineEntries reads packageDir/package.json's "rhombus.inline" key,
// composes any imported JSON files (recursively, file-relative, package-scoped,
// cycle-guarded), validates every entry's shape, and returns the concatenated
// entry list in encounter order. A package with no "rhombus.inline" key returns
// (nil, nil) — absence is not an error. Malformed JSON, an out-of-package import,
// an import cycle, or a non-certified entry shape are all hard errors.
func LoadInlineEntries(packageDir string) ([]Entry, error) {
	packageDir = filepath.Clean(packageDir)
	seen := map[string]bool{}
	return loadFromPackageJSON(packageDir, packageDir, seen)
}

// loadFromPackageJSON loads the inline config declared in packageDir's
// package.json. rootDir bounds the import escape check (imports must resolve
// inside the owning package). seen is the realpath set guarding import cycles.
func loadFromPackageJSON(packageDir, rootDir string, seen map[string]bool) ([]Entry, error) {
	path := filepath.Join(packageDir, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("inline: cannot read %s: %w", path, err)
	}
	var pkg pkgJSONInline
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, fmt.Errorf("inline: malformed package.json %s: %w", path, err)
	}
	if pkg.Inline == nil {
		return nil, nil
	}
	return composeInline(pkg.Inline, rootDir, seen, path)
}

// composeInline validates cfg's own entries and appends any imported files'
// entries. from names the file cfg came from, for cycle diagnostics.
func composeInline(cfg *rawInlineConfig, rootDir string, seen map[string]bool, from string) ([]Entry, error) {
	out := make([]Entry, 0, len(cfg.Entries))
	for i, e := range cfg.Entries {
		if _, ok := e.Kind(); !ok {
			return nil, fmt.Errorf("INLINE_ENTRY_SHAPE: %s entry %d is not a certified shape (type=%q impl=%q member=%q)", from, i, e.Type, e.Impl, e.Member)
		}
		out = append(out, e)
	}
	imports, err := importPaths(cfg.Import, from)
	if err != nil {
		return nil, err
	}
	for _, rel := range imports {
		abs := filepath.Clean(filepath.Join(filepath.Dir(from), rel))
		real, rerr := filepath.EvalSymlinks(abs)
		if rerr != nil {
			real = abs
		}
		if !withinRoot(rootDir, abs) {
			return nil, fmt.Errorf("INLINE_ENTRY_IMPORT_ESCAPE: %s imports %q which resolves outside package %s", from, rel, rootDir)
		}
		if seen[real] {
			return nil, fmt.Errorf("INLINE_ENTRY_IMPORT_CYCLE: import cycle reaching %s", abs)
		}
		seen[real] = true
		nested, ierr := loadImportFile(abs, rootDir, seen)
		if ierr != nil {
			return nil, ierr
		}
		out = append(out, nested...)
	}
	return out, nil
}

// loadImportFile reads one imported JSON file (same schema as the package.json
// key's value) and composes it.
func loadImportFile(path, rootDir string, seen map[string]bool) ([]Entry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("INLINE_ENTRY_IMPORT: cannot read %s: %w", path, err)
	}
	var cfg rawInlineConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("INLINE_ENTRY_IMPORT: malformed %s: %w", path, err)
	}
	return composeInline(&cfg, rootDir, seen, path)
}

// importPaths normalizes the "import" field (string | []string | absent) to a
// slice of file-relative paths.
func importPaths(raw json.RawMessage, from string) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var one string
	if err := json.Unmarshal(raw, &one); err == nil {
		return []string{one}, nil
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err == nil {
		return many, nil
	}
	return nil, fmt.Errorf("INLINE_ENTRY_IMPORT: %s import must be a string or array of strings", from)
}

// withinRoot reports whether abs lies inside root (root itself included).
func withinRoot(root, abs string) bool {
	rel, err := filepath.Rel(root, abs)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

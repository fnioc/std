package inlinetransform

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// EntryKind classifies a publish-list entry by the TS namespace it anchors to.
// Field names map to namespaces: type is a type-namespace export (a token
// string "@pkg:Name"); impl is a value-namespace export (self-relative to the
// declaring package); member is shared.
type EntryKind int

const (
	// KindMember is an interface-member sugar entry: type + impl + member. The
	// body lives on the impl export's member of the same name. CERTIFIED.
	KindMember EntryKind = iota
	// KindFunction is a free-function sugar entry: impl only. There is no
	// type-side anchor; the module specifier is the owning package's own name
	// and the export is impl. CERTIFIED.
	KindFunction
	// KindClassMember is a class-member sugar entry: type + member. SPECCED but
	// NOT CERTIFIED — recognized only so it can be rejected distinctly.
	KindClassMember
	// KindObjectLiteralMember is an object-literal-member sugar entry: impl +
	// member. SPECCED but NOT CERTIFIED — recognized for a distinct rejection.
	KindObjectLiteralMember
)

// KindStatus is the certification verdict for an entry's recognized shape.
type KindStatus int

const (
	// StatusMalformed: the field-presence pattern matches none of the four
	// grammar rows (a both+neither mixture, a lone/paired field that fits no
	// row, or a member==impl / malformed-token violation of an otherwise
	// certified row). The caller raises INLINE_ENTRY_SHAPE.
	StatusMalformed KindStatus = iota
	// StatusCertified: an inlineable shape — interface-member or free-function.
	StatusCertified
	// StatusUncertified: a recognized shape that is specced but not yet
	// certified — class-member or object-literal-member. The caller raises
	// INLINE_KIND_UNCERTIFIED.
	StatusUncertified
)

// Kind classifies e by field presence into one of the four grammar rows and
// returns the row's kind plus its certification status:
//
//	type + impl + member  → interface member        (certified)
//	impl only             → free function            (certified)
//	type + member         → class member             (uncertified)
//	impl + member         → object-literal member    (uncertified)
//
// Any other field-presence pattern — a type+impl pair, a lone type/impl/member,
// the empty entry, or a member==impl / malformed-type-token violation of the
// interface-member row — is StatusMalformed. Uncertified rows are recognized by
// presence alone; their finer fields are not validated (they are rejected
// regardless).
func (e Entry) Kind() (EntryKind, KindStatus) {
	hasType := e.Type != ""
	hasImpl := e.Impl != ""
	hasMember := e.Member != ""
	switch {
	case hasType && hasImpl && hasMember:
		// interface member: member must differ from impl, and type must be a
		// well-formed "<package>:<TypeName>" token.
		if e.Member == e.Impl {
			return 0, StatusMalformed
		}
		if _, _, ok := splitTypeToken(e.Type); !ok {
			return 0, StatusMalformed
		}
		return KindMember, StatusCertified
	case hasImpl && !hasType && !hasMember:
		// free function: no type-side anchor exists.
		return KindFunction, StatusCertified
	case hasType && hasMember && !hasImpl:
		// class member: recognized, not yet certified.
		return KindClassMember, StatusUncertified
	case hasImpl && hasMember && !hasType:
		// object-literal member: recognized, not yet certified.
		return KindObjectLiteralMember, StatusUncertified
	default:
		return 0, StatusMalformed
	}
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
		switch _, status := e.Kind(); status {
		case StatusMalformed:
			return nil, fmt.Errorf("INLINE_ENTRY_SHAPE: %s entry %d matches no grammar row (type=%q impl=%q member=%q)", from, i, e.Type, e.Impl, e.Member)
		case StatusUncertified:
			return nil, fmt.Errorf("INLINE_KIND_UNCERTIFIED: %s entry %d is a specced-but-not-yet-certified shape (class-member and object-literal-member are not certified) (type=%q impl=%q member=%q)", from, i, e.Type, e.Impl, e.Member)
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

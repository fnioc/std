package inlinetransform

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// EntryKind classifies a publish-list entry by field KIND, not just presence:
// type names a TYPE (a TypeIdentifier reference — an interface/class the
// member is declared on); impl names a VALUE (a fully-qualified export); member
// is the member name, shared by both member shapes.
type EntryKind int

const (
	// KindMember is an instance-member sugar entry: type + member, with impl
	// present when the member's declaration is ambient (a bodyless interface
	// member — the body lives on impl's member-named property; every member
	// entry in the workspace today is this shape, CERTIFIED) or absent when the
	// declaration IS its own body (a class method; recognized, not yet
	// certified — no current entry is this shape).
	KindMember EntryKind = iota
	// KindFloater is a free-standing sugar entry: impl only, no type, no
	// member — the impl function's own source is the body. CERTIFIED.
	KindFloater
	// KindStaticMember is a static / namespace-const member sugar entry: impl +
	// member, no type — the impl value is both the call-base anchor and the
	// body holder. SPECCED but NOT CERTIFIED — recognized only so it can be
	// rejected distinctly; no current entry is this shape.
	KindStaticMember
)

// KindStatus is the certification verdict for an entry's recognized shape.
type KindStatus int

const (
	// StatusMalformed: the field-presence pattern fits no shape (type without
	// member, member without type or impl, the empty entry), or a present
	// type/impl reference fails to deserialize. The caller raises
	// INLINE_ENTRY_SHAPE.
	StatusMalformed KindStatus = iota
	// StatusCertified: an inlineable shape — an ambient instance member or a
	// floater.
	StatusCertified
	// StatusUncertified: a recognized shape that is specced but not yet
	// certified — an own-body instance member or a static member. The caller
	// raises INLINE_KIND_UNCERTIFIED.
	StatusUncertified
)

// Kind classifies e by field KIND and presence into one of four rows and
// returns the row's kind plus its certification status:
//
//	type + member + impl  → instance member, ambient   (certified)
//	type + member         → instance member, own body  (uncertified)
//	impl  + member         → static member              (uncertified)
//	impl only              → floater                    (certified)
//
// type is present only paired with member (a lone type is malformed); every
// other combination requires member alongside type or impl (a lone member, or
// the empty entry, is malformed). A present type or impl must deserialize
// through ParseTypeRef — an absent package qualifier or any other malformed
// reference is malformed, loudly, never a silent skip.
func (e Entry) Kind() (EntryKind, KindStatus) {
	hasType := e.Type != ""
	hasImpl := e.Impl != ""
	hasMember := e.Member != ""

	switch {
	case hasType && hasMember && hasImpl:
		if !parsesCleanly(e.Type) || !parsesCleanly(e.Impl) {
			return 0, StatusMalformed
		}
		return KindMember, StatusCertified
	case hasType && hasMember && !hasImpl:
		if !parsesCleanly(e.Type) {
			return 0, StatusMalformed
		}
		return KindMember, StatusUncertified
	case hasImpl && hasMember && !hasType:
		if !parsesCleanly(e.Impl) {
			return 0, StatusMalformed
		}
		return KindStaticMember, StatusUncertified
	case hasImpl && !hasMember && !hasType:
		if !parsesCleanly(e.Impl) {
			return 0, StatusMalformed
		}
		return KindFloater, StatusCertified
	default:
		// type without member, member without type or impl, or the empty entry.
		return 0, StatusMalformed
	}
}

// parsesCleanly reports whether ref deserializes through ParseTypeRef — the
// grammar-row certification gate every present type/impl reference must clear.
func parsesCleanly(ref string) bool {
	_, err := ParseTypeRef(ref)
	return err == nil
}

// rawInlineConfig is the "rhombus-std" marker's own object in a package.json
// (or, recursively, an imported JSON file composing into it): "inline" holds
// the publish list, "import" composes further files into it.
type rawInlineConfig struct {
	Inline *rawInlineBlock `json:"inline"`
	Import json.RawMessage `json:"import"` // string | []string | absent
}

// rawInlineBlock is the "inline" key's own object: entries is the publish
// list.
type rawInlineBlock struct {
	Entries []Entry `json:"entries"`
}

// pkgJSONInline is a minimal package.json view exposing only the marker key.
type pkgJSONInline struct {
	RhombusStd *rawInlineConfig `json:"rhombus-std"`
}

// LoadInlineEntries reads packageDir/package.json's "rhombus-std" marker's
// "inline" object's "entries" list, composes any imported JSON files
// (recursively, file-relative, package-scoped, cycle-guarded), validates every
// entry's shape, and returns the concatenated entry list in encounter order. A
// package with no "rhombus-std" key returns (nil, nil) — absence is not an
// error. Malformed JSON, an out-of-package import, an import cycle, or a
// non-certified entry shape are all hard errors.
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
	if pkg.RhombusStd == nil {
		return nil, nil
	}
	return composeInline(pkg.RhombusStd, rootDir, seen, path)
}

// composeInline validates cfg's own entries and appends any imported files'
// entries. from names the file cfg came from, for cycle diagnostics; rootDir
// is the declaring package's own root, which every entry's impl (when present)
// must self-reference — the side-parser only ever reads files inside rootDir,
// so an impl naming any other package cannot resolve and is rejected here,
// loudly, at load time rather than as a confusing not-found later.
func composeInline(cfg *rawInlineConfig, rootDir string, seen map[string]bool, from string) ([]Entry, error) {
	var entries []Entry
	if cfg.Inline != nil {
		entries = cfg.Inline.Entries
	}
	out := make([]Entry, 0, len(entries))
	for i, e := range entries {
		switch _, status := e.Kind(); status {
		case StatusMalformed:
			return nil, fmt.Errorf("INLINE_ENTRY_SHAPE: %s entry %d matches no grammar row (type=%q impl=%q member=%q)", from, i, e.Type, e.Impl, e.Member)
		case StatusUncertified:
			return nil, fmt.Errorf("INLINE_KIND_UNCERTIFIED: %s entry %d is a specced-but-not-yet-certified shape (own-body instance members and static members are not certified) (type=%q impl=%q member=%q)", from, i, e.Type, e.Impl, e.Member)
		}
		if e.Impl != "" {
			implRef, err := ParseTypeRef(e.Impl)
			if err != nil {
				return nil, fmt.Errorf("INLINE_ENTRY_SHAPE: %s entry %d has a malformed impl %q: %w", from, i, e.Impl, err)
			}
			if declaringPkg := packageName(rootDir); implRef.From != declaringPkg {
				return nil, fmt.Errorf("INLINE_ENTRY_IMPL_FOREIGN: %s entry %d impl %q names package %q, but must self-reference the declaring package %q — the side-parser only reads files inside it", from, i, e.Impl, implRef.From, declaringPkg)
			}
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

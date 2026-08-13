package inlinetransform

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestEntryKindInference(t *testing.T) {
	cases := []struct {
		name   string
		e      Entry
		kind   EntryKind
		status KindStatus
	}{
		// The four grammar rows.
		{"instance member, ambient", Entry{Type: "@rhombus-std/di.core:IServiceQuery", Impl: "p:ServiceQueryInline", Member: "isService"}, KindMember, StatusCertified},
		{"instance member, own body", Entry{Type: "@rhombus-std/di.core:Foo", Member: "bar"}, KindMember, StatusUncertified},
		{"static member", Entry{Impl: "p:FooBase", Member: "bar"}, KindStaticMember, StatusUncertified},
		{"floater", Entry{Impl: "p:tokenOf"}, KindFloater, StatusCertified},

		// A malformed type token on the ambient-member row is malformed.
		{"ambient member: type no colon", Entry{Type: "nocolon", Impl: "p:x", Member: "m"}, 0, StatusMalformed},
		{"ambient member: type empty package", Entry{Type: ":T", Impl: "p:x", Member: "m"}, 0, StatusMalformed},
		{"ambient member: type empty name", Entry{Type: "p:", Impl: "p:x", Member: "m"}, 0, StatusMalformed},
		// A malformed impl token on the ambient-member row is malformed too.
		{"ambient member: impl no colon", Entry{Type: "p:T", Impl: "nocolon", Member: "m"}, 0, StatusMalformed},
		// A malformed type token on the own-body member row is malformed.
		{"own-body member: type no colon", Entry{Type: "nocolon", Member: "m"}, 0, StatusMalformed},
		// A malformed impl token on the static-member row is malformed.
		{"static member: impl no colon", Entry{Impl: "nocolon", Member: "m"}, 0, StatusMalformed},
		// A malformed impl token on the floater row is malformed.
		{"floater: impl no colon", Entry{Impl: "nocolon"}, 0, StatusMalformed},

		// Both+neither mixtures and lone fields fit no row.
		{"empty entry", Entry{}, 0, StatusMalformed},
		{"type only (no member)", Entry{Type: "p:T"}, 0, StatusMalformed},
		{"member only (no type, no impl)", Entry{Member: "m"}, 0, StatusMalformed},
		{"type+impl, no member", Entry{Type: "p:T", Impl: "p:V"}, 0, StatusMalformed},

		// Empty-string fields are treated as absent.
		{"empty-string type is absent → static member", Entry{Type: "", Impl: "p:fn", Member: "m"}, KindStaticMember, StatusUncertified},
		{"empty-string member is absent → floater", Entry{Impl: "p:fn", Member: ""}, KindFloater, StatusCertified},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind, status := c.e.Kind()
			if status != c.status {
				t.Fatalf("Kind() status = %v, want %v", status, c.status)
			}
			if status != StatusMalformed && kind != c.kind {
				t.Fatalf("Kind() kind = %v, want %v", kind, c.kind)
			}
		})
	}
}

func TestLoadInlineEntriesComposition(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": {
    "inline": { "entries": [ { "type": "p:A", "impl": "pkg:A", "member": "m1" } ] },
    "import": "./more.json"
  }
}`)
	write(t, filepath.Join(root, "more.json"), `{
  "inline": { "entries": [ { "type": "p:B", "impl": "pkg:B", "member": "m2" } ] },
  "import": ["./even-more.json"]
}`)
	write(t, filepath.Join(root, "even-more.json"), `{
  "inline": { "entries": [ { "impl": "pkg:tokenOf" } ] }
}`)

	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("LoadInlineEntries: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("got %d entries, want 3: %+v", len(entries), entries)
	}
	if entries[0].Member != "m1" || entries[1].Member != "m2" || entries[2].Impl != "pkg:tokenOf" {
		t.Fatalf("unexpected entry order/content: %+v", entries)
	}
}

func TestLoadInlineEntriesNoKey(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "pkg" }`)
	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries != nil {
		t.Fatalf("expected nil entries for a package with no rhombus-std marker, got %+v", entries)
	}
}

func TestLoadInlineEntriesBadShape(t *testing.T) {
	root := t.TempDir()
	// type+impl with no member fits no row.
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [ { "type": "p:A", "impl": "pkg:AImpl" } ] } }
}`)
	_, err := LoadInlineEntries(root)
	if err == nil {
		t.Fatal("expected INLINE_ENTRY_SHAPE error for a type+impl, no-member entry")
	}
	if !strings.Contains(err.Error(), "INLINE_ENTRY_SHAPE") {
		t.Fatalf("want INLINE_ENTRY_SHAPE, got %v", err)
	}
}

func TestLoadInlineEntriesUncertifiedShape(t *testing.T) {
	// An own-body instance member (type+member, no impl) and a static member
	// (impl+member, no type) are recognized-but-not-certified shapes: they must
	// be rejected with the distinct INLINE_KIND_UNCERTIFIED error, never the
	// malformed-shape error.
	ownBody := `{ "name": "pkg", "rhombus-std": { "inline": { "entries": [ { "type": "p:A", "member": "m" } ] } } }`
	static := `{ "name": "pkg", "rhombus-std": { "inline": { "entries": [ { "impl": "pkg:AImpl", "member": "m" } ] } } }`
	for name, body := range map[string]string{"own-body member": ownBody, "static member": static} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			write(t, filepath.Join(root, "package.json"), body)
			_, err := LoadInlineEntries(root)
			if err == nil {
				t.Fatal("expected INLINE_KIND_UNCERTIFIED error")
			}
			if !strings.Contains(err.Error(), "INLINE_KIND_UNCERTIFIED") {
				t.Fatalf("want INLINE_KIND_UNCERTIFIED, got %v", err)
			}
		})
	}
}

func TestLoadInlineEntriesCertifiedShapes(t *testing.T) {
	// Both certified rows load without error.
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [
    { "type": "p:A", "impl": "pkg:AImpl", "member": "m" },
    { "impl": "pkg:freeFn" }
  ] } }
}`)
	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("LoadInlineEntries: %v", err)
	}
	if len(entries) != 2 || entries[0].Member != "m" || entries[1].Impl != "pkg:freeFn" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
}

// TestLoadInlineEntriesImplMustSelfReference: an impl naming a package OTHER
// than the declaring one is rejected at load time — the side-parser only ever
// reads files inside the declaring package, so a foreign impl can never
// resolve, and staying silent about it would surface later as a confusing
// not-found instead of a named authoring error.
func TestLoadInlineEntriesImplMustSelfReference(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [ { "impl": "@other/pkg:tokenOf" } ] } }
}`)
	_, err := LoadInlineEntries(root)
	if err == nil {
		t.Fatal("expected INLINE_ENTRY_IMPL_FOREIGN error")
	}
	if !strings.Contains(err.Error(), "INLINE_ENTRY_IMPL_FOREIGN") {
		t.Fatalf("want INLINE_ENTRY_IMPL_FOREIGN, got %v", err)
	}
}

func TestLoadInlineEntriesImportCycle(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [] }, "import": "./a.json" }
}`)
	write(t, filepath.Join(root, "a.json"), `{ "inline": { "entries": [] }, "import": "./b.json" }`)
	write(t, filepath.Join(root, "b.json"), `{ "inline": { "entries": [] }, "import": "./a.json" }`)
	if _, err := LoadInlineEntries(root); err == nil {
		t.Fatal("expected INLINE_ENTRY_IMPORT_CYCLE error")
	}
}

func TestLoadInlineEntriesImportEscape(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [] }, "import": "../escape.json" }
}`)
	if _, err := LoadInlineEntries(root); err == nil {
		t.Fatal("expected INLINE_ENTRY_IMPORT_ESCAPE error")
	}
}

// TestLoadInlineEntriesMalformedImportJSON: a syntactically-broken imported file
// is a loud INLINE_ENTRY_IMPORT error (not a bare JSON parse error). The JS twin
// (inline-entries.mjs) is aligned to wrap parse failures the same way.
func TestLoadInlineEntriesMalformedImportJSON(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [] }, "import": "./bad.json" }
}`)
	write(t, filepath.Join(root, "bad.json"), `{ "inline": [ this is not json `)
	_, err := LoadInlineEntries(root)
	if err == nil {
		t.Fatal("expected INLINE_ENTRY_IMPORT error for malformed imported JSON")
	}
	if !strings.Contains(err.Error(), "INLINE_ENTRY_IMPORT") {
		t.Fatalf("want INLINE_ENTRY_IMPORT, got %v", err)
	}
}

// TestLoadInlineEntriesNonStringImport: an import value that is neither a string
// nor an array of strings is INLINE_ENTRY_IMPORT.
func TestLoadInlineEntriesNonStringImport(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [] }, "import": 42 }
}`)
	_, err := LoadInlineEntries(root)
	if err == nil {
		t.Fatal("expected INLINE_ENTRY_IMPORT error for a non-string/array import")
	}
	if !strings.Contains(err.Error(), "INLINE_ENTRY_IMPORT") {
		t.Fatalf("want INLINE_ENTRY_IMPORT, got %v", err)
	}
}

// TestLoadInlineEntriesDuplicateAcrossImports pins the chosen behavior for the
// same entry arriving via two imports: the loader CONCATENATES undeduped (both
// copies are returned). Deduplication, where it matters, happens later at the
// decl-map level (one node → one target, benign last-wins). The JS twin returns
// the same undeduped concatenation.
func TestLoadInlineEntriesDuplicateAcrossImports(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus-std": { "inline": { "entries": [] }, "import": ["./a.json", "./b.json"] }
}`)
	write(t, filepath.Join(root, "a.json"), `{ "inline": { "entries": [ { "impl": "pkg:dup" } ] } }`)
	write(t, filepath.Join(root, "b.json"), `{ "inline": { "entries": [ { "impl": "pkg:dup" } ] } }`)
	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("LoadInlineEntries: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("duplicate entries across two imports should be concatenated undeduped (2), got %d: %+v", len(entries), entries)
	}
	if entries[0].Impl != "pkg:dup" || entries[1].Impl != "pkg:dup" {
		t.Fatalf("both entries should be impl=pkg:dup, got %+v", entries)
	}
}

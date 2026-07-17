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
		{"interface member", Entry{Type: "@rhombus-std/di.core:IServiceQuery", Impl: "ServiceQueryInline", Member: "isService"}, KindMember, StatusCertified},
		{"free function (impl only)", Entry{Impl: "tokenOf"}, KindFunction, StatusCertified},
		{"class member", Entry{Type: "@rhombus-std/di.core:Foo", Member: "bar"}, KindClassMember, StatusUncertified},
		{"object-literal member", Entry{Impl: "FooLiteral", Member: "bar"}, KindObjectLiteralMember, StatusUncertified},

		// member==impl on the interface-member row is malformed, not certified.
		{"member==impl", Entry{Type: "p:T", Impl: "x", Member: "x"}, 0, StatusMalformed},
		// A malformed type token on the interface-member row is malformed.
		{"type no colon", Entry{Type: "nocolon", Impl: "x", Member: "m"}, 0, StatusMalformed},
		{"type empty package", Entry{Type: ":T", Impl: "x", Member: "m"}, 0, StatusMalformed},
		{"type empty name", Entry{Type: "p:", Impl: "x", Member: "m"}, 0, StatusMalformed},

		// Both+neither mixtures and lone fields fit no row.
		{"empty entry", Entry{}, 0, StatusMalformed},
		{"type only", Entry{Type: "p:T"}, 0, StatusMalformed},
		{"member only", Entry{Member: "m"}, 0, StatusMalformed},
		{"type+impl (old function shape, now gone)", Entry{Type: "p:tokenOf", Impl: "tokenOf"}, 0, StatusMalformed},

		// Empty-string fields are treated as absent.
		{"empty-string type is absent → free function", Entry{Type: "", Impl: "fn"}, KindFunction, StatusCertified},
		{"empty-string member is absent → free function", Entry{Impl: "fn", Member: ""}, KindFunction, StatusCertified},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind, status := c.e.Kind()
			if status != c.status {
				t.Fatalf("Kind() status = %v, want %v", status, c.status)
			}
			if status == StatusCertified && kind != c.kind {
				t.Fatalf("Kind() kind = %v, want %v", kind, c.kind)
			}
			if status == StatusUncertified && kind != c.kind {
				t.Fatalf("Kind() uncertified kind = %v, want %v", kind, c.kind)
			}
		})
	}
}

func TestLoadInlineEntriesComposition(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus.inline": {
    "entries": [ { "type": "p:A", "impl": "AImpl", "member": "m1" } ],
    "import": "./more.json"
  }
}`)
	write(t, filepath.Join(root, "more.json"), `{
  "entries": [ { "type": "p:B", "impl": "BImpl", "member": "m2" } ],
  "import": ["./even-more.json"]
}`)
	write(t, filepath.Join(root, "even-more.json"), `{
  "entries": [ { "impl": "tokenOf" } ]
}`)

	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("LoadInlineEntries: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("got %d entries, want 3: %+v", len(entries), entries)
	}
	if entries[0].Member != "m1" || entries[1].Member != "m2" || entries[2].Impl != "tokenOf" {
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
		t.Fatalf("expected nil entries for a package with no rhombus.inline, got %+v", entries)
	}
}

func TestLoadInlineEntriesBadShape(t *testing.T) {
	root := t.TempDir()
	// type+impl with no member: the retired free-function shape, now malformed.
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus.inline": { "entries": [ { "type": "p:A", "impl": "AImpl" } ] }
}`)
	_, err := LoadInlineEntries(root)
	if err == nil {
		t.Fatal("expected INLINE_ENTRY_SHAPE error for a type+impl entry")
	}
	if !strings.Contains(err.Error(), "INLINE_ENTRY_SHAPE") {
		t.Fatalf("want INLINE_ENTRY_SHAPE, got %v", err)
	}
}

func TestLoadInlineEntriesUncertifiedShape(t *testing.T) {
	// A class-member entry (type+member) is a recognized-but-not-certified shape:
	// it must be rejected with the distinct INLINE_KIND_UNCERTIFIED error, never
	// the malformed-shape error.
	classMember := `{ "name": "pkg", "rhombus.inline": { "entries": [ { "type": "p:A", "member": "m" } ] } }`
	objectLiteral := `{ "name": "pkg", "rhombus.inline": { "entries": [ { "impl": "AImpl", "member": "m" } ] } }`
	for name, body := range map[string]string{"class member": classMember, "object-literal member": objectLiteral} {
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
  "rhombus.inline": { "entries": [
    { "type": "p:A", "impl": "AImpl", "member": "m" },
    { "impl": "freeFn" }
  ] }
}`)
	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("LoadInlineEntries: %v", err)
	}
	if len(entries) != 2 || entries[0].Member != "m" || entries[1].Impl != "freeFn" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
}

func TestLoadInlineEntriesImportCycle(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus.inline": { "entries": [], "import": "./a.json" }
}`)
	write(t, filepath.Join(root, "a.json"), `{ "entries": [], "import": "./b.json" }`)
	write(t, filepath.Join(root, "b.json"), `{ "entries": [], "import": "./a.json" }`)
	if _, err := LoadInlineEntries(root); err == nil {
		t.Fatal("expected INLINE_ENTRY_IMPORT_CYCLE error")
	}
}

func TestLoadInlineEntriesImportEscape(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus.inline": { "entries": [], "import": "../escape.json" }
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
  "rhombus.inline": { "entries": [], "import": "./bad.json" }
}`)
	write(t, filepath.Join(root, "bad.json"), `{ "entries": [ this is not json `)
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
  "rhombus.inline": { "entries": [], "import": 42 }
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
  "rhombus.inline": { "entries": [], "import": ["./a.json", "./b.json"] }
}`)
	write(t, filepath.Join(root, "a.json"), `{ "entries": [ { "impl": "dup" } ] }`)
	write(t, filepath.Join(root, "b.json"), `{ "entries": [ { "impl": "dup" } ] }`)
	entries, err := LoadInlineEntries(root)
	if err != nil {
		t.Fatalf("LoadInlineEntries: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("duplicate entries across two imports should be concatenated undeduped (2), got %d: %+v", len(entries), entries)
	}
	if entries[0].Impl != "dup" || entries[1].Impl != "dup" {
		t.Fatalf("both entries should be impl=dup, got %+v", entries)
	}
}

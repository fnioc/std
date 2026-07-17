package inlinetransform

import (
	"path/filepath"
	"testing"
)

func TestEntryKindInference(t *testing.T) {
	cases := []struct {
		name string
		e    Entry
		kind EntryKind
		ok   bool
	}{
		{"member", Entry{Type: "@rhombus-std/di.core:ServiceQuery", Impl: "ServiceQueryInline", Member: "isService"}, KindMember, true},
		{"function", Entry{Type: "@rhombus-std/primitives:tokenOf", Impl: "tokenOf"}, KindFunction, true},
		{"function name mismatch", Entry{Type: "@rhombus-std/primitives:tokenOf", Impl: "other"}, 0, false},
		{"member==impl", Entry{Type: "p:T", Impl: "x", Member: "x"}, 0, false},
		{"missing type", Entry{Impl: "x", Member: "m"}, 0, false},
		{"missing impl", Entry{Type: "p:T", Member: "m"}, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind, ok := c.e.Kind()
			if ok != c.ok || (ok && kind != c.kind) {
				t.Fatalf("Kind() = (%v,%v), want (%v,%v)", kind, ok, c.kind, c.ok)
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
  "entries": [ { "type": "p:tokenOf", "impl": "tokenOf" } ]
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
	write(t, filepath.Join(root, "package.json"), `{
  "name": "pkg",
  "rhombus.inline": { "entries": [ { "type": "p:A", "member": "m" } ] }
}`)
	if _, err := LoadInlineEntries(root); err == nil {
		t.Fatal("expected INLINE_ENTRY_SHAPE error for a member entry missing impl")
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

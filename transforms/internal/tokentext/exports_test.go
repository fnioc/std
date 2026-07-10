package tokentext

import (
	"sort"
	"testing"
)

func entryStrings(entries []ExportEntry) []string {
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Subpath+"=>"+e.TargetRel)
	}
	sort.Strings(out)
	return out
}

func TestCollectExportEntriesSubpathMap(t *testing.T) {
	pkg, ok := ParsePackageJSON(`{
		"name": "your-lib",
		"version": "3.4.5",
		"exports": { ".": "./index.js", "./contracts": "./contracts/index.js" }
	}`)
	if !ok {
		t.Fatal("ParsePackageJSON failed")
	}
	got := entryStrings(CollectExportEntries(pkg))
	want := []string{"=>index.js", "contracts=>contracts/index.js"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestCollectExportEntriesConditions(t *testing.T) {
	pkg, ok := ParsePackageJSON(`{
		"name": "your-lib",
		"exports": { ".": { "types": "./index.d.ts", "import": "./index.js" } }
	}`)
	if !ok {
		t.Fatal("ParsePackageJSON failed")
	}
	got := entryStrings(CollectExportEntries(pkg))
	// Root entry contributes both the types and import channel targets.
	want := map[string]bool{"=>index.d.ts": true, "=>index.js": true}
	for _, g := range got {
		if !want[g] {
			t.Errorf("unexpected entry %q in %v", g, got)
		}
	}
	if len(got) != 2 {
		t.Errorf("got %v, want 2 entries", got)
	}
}

func TestCollectExportEntriesFallbackAndMissingName(t *testing.T) {
	pkg, ok := ParsePackageJSON(`{ "name": "n", "types": "./dist/index.d.ts" }`)
	if !ok {
		t.Fatal("ParsePackageJSON failed")
	}
	got := entryStrings(CollectExportEntries(pkg))
	if len(got) != 1 || got[0] != "=>dist/index.d.ts" {
		t.Errorf("fallback entries = %v, want [=>dist/index.d.ts]", got)
	}

	if _, ok := ParsePackageJSON(`{ "version": "1.0.0" }`); ok {
		t.Error("nameless package.json should not parse ok")
	}
	if _, ok := ParsePackageJSON(`{ not json`); ok {
		t.Error("malformed package.json should not parse ok")
	}
}

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

// EntrySourceStems is the single build-state-independent candidate set shared by
// both Go token-derivation call sites (tokens.entrySourceFile and
// dioptionstransform.isRootExportTarget), and mirrors the TS engine's
// entrySourceFile. These assertions pin the exact stems — literal target first,
// then the `dist/<X> -> src/<X>` twin — so the two engines cannot drift.
func TestEntrySourceStems(t *testing.T) {
	const dir = "/proj/node_modules/my-lib"

	cases := []struct {
		name  string
		entry ExportEntry
		want  []string
	}{
		{
			// A dist target yields the literal stem first, then its src twin —
			// the twin is what a dist-referenced package compiling ITSELF loads.
			name:  "dist root: literal then src twin",
			entry: ExportEntry{Subpath: "", TargetRel: "dist/index.js"},
			want:  []string{dir + "/dist/index", dir + "/src/index"},
		},
		{
			// A `.d.ts` target strips to the same `dist/index` stem and twin.
			name:  "dist root .d.ts: same stem and twin",
			entry: ExportEntry{Subpath: "", TargetRel: "dist/index.d.ts"},
			want:  []string{dir + "/dist/index", dir + "/src/index"},
		},
		{
			// A subpath dist target twins on its own basename.
			name:  "dist subpath: literal then src twin",
			entry: ExportEntry{Subpath: "extras", TargetRel: "dist/extras.js"},
			want:  []string{dir + "/dist/extras", dir + "/src/extras"},
		},
		{
			// A raw `./index.js` (no dist prefix): only the literal stem, no twin.
			name:  "non-dist target: literal only",
			entry: ExportEntry{Subpath: "", TargetRel: "index.js"},
			want:  []string{dir + "/index"},
		},
		{
			// Guard on the non-empty remainder: `dist/` alone never twins.
			name:  "bare dist prefix: no twin",
			entry: ExportEntry{Subpath: "", TargetRel: "dist/"},
			want:  []string{dir + "/dist/"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := EntrySourceStems(dir, tc.entry)
			if len(got) != len(tc.want) {
				t.Fatalf("stems = %v, want %v", got, tc.want)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Fatalf("stems = %v, want %v", got, tc.want)
				}
			}
		})
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

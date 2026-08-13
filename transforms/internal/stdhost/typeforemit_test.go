package stdhost

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fnioc/std/transforms/internal/typeemit"
	"github.com/fnioc/std/transforms/internal/typeforhoist"
)

func writeManifest(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestEmissionDefaultsToHoisted(t *testing.T) {
	// No package.json at all, and a package.json carrying no marker, both mean
	// the default.
	empty := t.TempDir()
	if got, err := readEmission(empty); err != nil || got != EmissionHoisted {
		t.Fatalf("want hoisted, got %q (%v)", got, err)
	}
	unmarked := t.TempDir()
	writeManifest(t, unmarked, `{ "name": "pkg" }`)
	if got, err := readEmission(unmarked); err != nil || got != EmissionHoisted {
		t.Fatalf("want hoisted, got %q (%v)", got, err)
	}
	partial := t.TempDir()
	writeManifest(t, partial, `{ "name": "pkg", "rhombus-std": { "inline": { "entries": [] } } }`)
	if got, err := readEmission(partial); err != nil || got != EmissionHoisted {
		t.Fatalf("want hoisted, got %q (%v)", got, err)
	}
}

func TestEmissionReadsTheMarker(t *testing.T) {
	dir := t.TempDir()
	writeManifest(t, dir, `{ "name": "pkg", "rhombus-std": { "typefor": { "emit": "inline" } } }`)
	if got, err := readEmission(dir); err != nil || got != EmissionInline {
		t.Fatalf("want inline, got %q (%v)", got, err)
	}
}

func TestEmissionRejectsAnUnknownValue(t *testing.T) {
	dir := t.TempDir()
	writeManifest(t, dir, `{ "name": "pkg", "rhombus-std": { "typefor": { "emit": "hoist" } } }`)
	_, err := readEmission(dir)
	if err == nil || !strings.Contains(err.Error(), `"hoist"`) {
		t.Fatalf("an unrecognized emission is a hard error naming the value, got %v", err)
	}
}

func TestHoistedModuleIsWrittenAndCleanedUp(t *testing.T) {
	dir := t.TempDir()
	roots := emitRoots{source: dir, out: filepath.Join(dir, "out")}
	path := filepath.Join(roots.out, typeforhoist.ModuleFile)

	registry := typeforhoist.NewRegistry(typeemit.HoistRef())
	if _, err := registry.Ref(typeforhoist.Named("IClock", "orders", nil)); err != nil {
		t.Fatal(err)
	}
	if err := writeHoistedModule(registry, roots); err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(written), `Type.named("IClock", "orders")`) {
		t.Fatalf("the module carries the const:\n%s", written)
	}

	// A later run that derives nothing takes the module with it rather than
	// leaving one describing types the project no longer names.
	if err := writeHoistedModule(typeforhoist.NewRegistry(typeemit.HoistRef()), roots); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("want the module removed, got %v", err)
	}
}

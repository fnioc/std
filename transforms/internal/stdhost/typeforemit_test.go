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

func writeSidecar(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "rhombus-std.json"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestEmissionDefaultsToHoisted(t *testing.T) {
	// No package.json at all; a package.json with no marker and no sidecar for
	// the defaulted `extends` to find; and a marker naming another block — all
	// three mean the default.
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

func TestEmissionReadsAnExtendedFile(t *testing.T) {
	// A package.json with no marker resolves as though it extended the sidecar,
	// so the emission may live there instead.
	defaulted := t.TempDir()
	writeManifest(t, defaulted, `{ "name": "pkg" }`)
	writeSidecar(t, defaulted, `{ "typefor": { "emit": "inline" } }`)
	if got, err := readEmission(defaulted); err != nil || got != EmissionInline {
		t.Fatalf("want inline from the sidecar, got %q (%v)", got, err)
	}

	// A marker present at all is authoritative: it no longer extends the sidecar
	// unless it says so, and what it declares wins what it extends.
	authoritative := t.TempDir()
	writeManifest(t, authoritative, `{ "name": "pkg", "rhombus-std": { "inline": { "entries": [] } } }`)
	writeSidecar(t, authoritative, `{ "typefor": { "emit": "inline" } }`)
	if got, err := readEmission(authoritative); err != nil || got != EmissionHoisted {
		t.Fatalf("a marker that extends nothing ignores the sidecar, got %q (%v)", got, err)
	}

	overriding := t.TempDir()
	writeManifest(
		t,
		overriding,
		`{ "name": "pkg", "rhombus-std": { "extends": "./rhombus-std.json", "typefor": { "emit": "hoisted" } } }`,
	)
	writeSidecar(t, overriding, `{ "typefor": { "emit": "inline" } }`)
	if got, err := readEmission(overriding); err != nil || got != EmissionHoisted {
		t.Fatalf("the local block wins what it extends, got %q (%v)", got, err)
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

func TestEmissionRejectsAMalformedBlock(t *testing.T) {
	dir := t.TempDir()
	writeManifest(t, dir, `{ "name": "pkg", "rhombus-std": { "typefor": "hoisted" } }`)
	if _, err := readEmission(dir); err == nil || !strings.Contains(err.Error(), "must be an object") {
		t.Fatalf("a non-object typefor block is a hard error, got %v", err)
	}
	nonString := t.TempDir()
	writeManifest(t, nonString, `{ "name": "pkg", "rhombus-std": { "typefor": { "emit": 1 } } }`)
	if _, err := readEmission(nonString); err == nil || !strings.Contains(err.Error(), "it must be") {
		t.Fatalf("a non-string emission is a hard error, got %v", err)
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

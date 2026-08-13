package stdhost

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/typeforhoist"
)

// Emission names how a project spells the types typefor derives.
type Emission string

const (
	// EmissionHoisted collects every derived type into one generated module of
	// named consts and leaves a reference at each call site. It is the default.
	EmissionHoisted Emission = "hoisted"
	// EmissionInline writes each `Type.*` factory tree out at the call site it
	// was derived for.
	EmissionInline Emission = "inline"
)

// projectManifest is the minimal package.json view carrying the emission choice:
//
//	{ "rhombus-std": { "typefor": { "emit": "hoisted" } } }
//
// It rides the PROJECT, never the shared ttsc descriptor — the descriptor is
// what every consumer dedupes to one spawn and one cache key, so nothing that
// varies per consumer may live there.
type projectManifest struct {
	RhombusStd *struct {
		Typefor *struct {
			Emit string `json:"emit"`
		} `json:"typefor"`
	} `json:"rhombus-std"`
}

// readEmission reads cwd's package.json for the project's emission choice.
// A missing package.json or a missing key is the default, hoisted; an
// unrecognized value is a hard error rather than a silent fallback, since the
// two forms are not interchangeable output.
func readEmission(cwd string) (Emission, error) {
	data, err := os.ReadFile(filepath.Join(cwd, "package.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return EmissionHoisted, nil
		}
		return "", fmt.Errorf("typefor emission: cannot read %s: %w", filepath.Join(cwd, "package.json"), err)
	}
	var manifest projectManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return "", fmt.Errorf("typefor emission: malformed %s: %w", filepath.Join(cwd, "package.json"), err)
	}
	if manifest.RhombusStd == nil || manifest.RhombusStd.Typefor == nil || manifest.RhombusStd.Typefor.Emit == "" {
		return EmissionHoisted, nil
	}
	switch emission := Emission(manifest.RhombusStd.Typefor.Emit); emission {
	case EmissionHoisted, EmissionInline:
		return emission, nil
	default:
		return "", fmt.Errorf(
			`typefor emission: %s declares "rhombus-std".typefor.emit = %q — it must be %q or %q`,
			filepath.Join(cwd, "package.json"), manifest.RhombusStd.Typefor.Emit, EmissionHoisted, EmissionInline,
		)
	}
}

// emitRoots are the two directories hoisted emission is anchored to: the root of
// the SOURCE tree, which every call site spells its relative specifier against,
// and the root of the EMITTED tree, where the generated module is written. The
// emitted tree mirrors the source tree, so the module being a direct child of
// each root makes one specifier correct in both.
type emitRoots struct {
	source string
	out    string
}

// resolveEmitRoots reads the roots off the program's compiler options, falling
// back to the common directory of the project's own files when rootDir is unset
// and to the source root when outDir is (a project that emits in place).
func resolveEmitRoots(prog *driver.Program, cwd string) emitRoots {
	options := prog.TSProgram.Options()
	source := options.RootDir
	if source == "" {
		source = commonSourceDirectory(prog, cwd)
	}
	source = absoluteAgainst(cwd, source)
	out := options.OutDir
	if out == "" {
		return emitRoots{source: source, out: source}
	}
	return emitRoots{source: source, out: absoluteAgainst(cwd, out)}
}

func absoluteAgainst(cwd, dir string) string {
	if filepath.IsAbs(dir) {
		return filepath.Clean(dir)
	}
	return filepath.Join(cwd, dir)
}

// commonSourceDirectory is the deepest directory containing every one of the
// project's own non-declaration files — what an emit roots its output tree at
// when no rootDir says otherwise.
func commonSourceDirectory(prog *driver.Program, cwd string) string {
	var dirs []string
	for _, sf := range prog.SourceFiles() {
		if sf.IsDeclarationFile {
			continue
		}
		file := filepath.FromSlash(sf.FileName())
		rel, err := filepath.Rel(cwd, file)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		dirs = append(dirs, filepath.Dir(file))
	}
	if len(dirs) == 0 {
		return cwd
	}
	sort.Strings(dirs)
	common := dirs[0]
	for _, dir := range dirs[1:] {
		common = commonPrefixDirectory(common, dir)
	}
	return common
}

func commonPrefixDirectory(left, right string) string {
	leftParts := strings.Split(left, string(filepath.Separator))
	rightParts := strings.Split(right, string(filepath.Separator))
	shared := 0
	for shared < len(leftParts) && shared < len(rightParts) && leftParts[shared] == rightParts[shared] {
		shared++
	}
	return strings.Join(leftParts[:shared], string(filepath.Separator))
}

// writeHoistedModule materializes the project's const table beside the emitted
// files, or removes a module left by an earlier build when this one derived
// nothing. The whole project is re-read and re-derived on every run, so the file
// is always written from scratch — there is no incremental path that could leave
// it describing a stale set of types.
func writeHoistedModule(registry *typeforhoist.Registry, roots emitRoots) error {
	path := filepath.Join(roots.out, typeforhoist.ModuleFile)
	source := registry.Module()
	if source == "" {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("typefor emission: cannot remove stale %s: %w", path, err)
		}
		return nil
	}
	if err := os.MkdirAll(roots.out, 0o755); err != nil {
		return fmt.Errorf("typefor emission: cannot create %s: %w", roots.out, err)
	}
	if err := os.WriteFile(path, []byte(source), 0o644); err != nil {
		return fmt.Errorf("typefor emission: cannot write %s: %w", path, err)
	}
	return nil
}

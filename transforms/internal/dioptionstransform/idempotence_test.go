package dioptionstransform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// writeOptFile writes body to path, creating parent directories.
func writeOptFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// buildOptionsWitnessWorkspace stands up the minimal program the addOptions stage
// needs: a real on-disk `@rhombus-std/options` package whose root export declares a
// generic `IOptions<T>` (resolveOptionsBase scans the module export graph for it),
// an ambient `declare module '@rhombus-std/di.core'` carrying the
// `IServiceManifestBase.addOptions<T>()` sugar overload the matcher anchors on, and
// a consumer main.ts that spells the sugar. The options package is symlinked into
// the app's node_modules and named in `files` so it lands in the program and its
// package.json is reachable to ctx.ReadFile.
func buildOptionsWitnessWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeOptFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	opts := filepath.Join(root, "packages", "options")
	writeOptFile(t, filepath.Join(opts, "package.json"), `{
  "name": "@rhombus-std/options",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	writeOptFile(t, filepath.Join(opts, "src", "index.ts"), "export interface IOptions<T> { readonly value: T; }\n")

	app := filepath.Join(root, "packages", "app")
	writeOptFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/options": "workspace:*" }
}`)
	link := filepath.Join(app, "node_modules", "@rhombus-std", "options")
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(opts, link); err != nil {
		t.Fatal(err)
	}

	writeOptFile(t, filepath.Join(app, "di.core.d.ts"), `declare module '@rhombus-std/di.core' {
  export interface IServiceManifestBase {
    addOptions<T>(): IServiceManifestBase;
    addOptions(optionsToken: string, tToken: string): IServiceManifestBase;
  }
  export const services: IServiceManifestBase;
}
`)
	writeOptFile(t, filepath.Join(app, "main.ts"), mainSrc)
	writeOptFile(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "di.core.d.ts", "node_modules/@rhombus-std/options/src/index.ts"]
}`)

	prog, diags, err := driver.LoadProgram(app, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("config diagnostics: %v", diags)
	}
	return prog, app
}

func mainOptionsSF(t *testing.T, prog *driver.Program) *shimast.SourceFile {
	t.Helper()
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "main.ts") {
			return sf
		}
	}
	t.Fatal("main.ts not found")
	return nil
}

// TestAddOptionsStageLowersAndIsIdempotent pins the addOptions stage on both the
// happy path and the fixed-point-loop contract. First it asserts the sugar lowers
// to the two-token verb over the SAME element token any resolve<T>()/add<T>() would
// derive (the wrapper is the closed-generic IOptions<T> form). Then — the reason
// this test exists — it re-runs the SAME stage over its own lowered output and
// asserts the IDENTICAL *SourceFile pointer: the stage is a looped member
// (stages.go), so the loop's terminating pass hands it the tree it already lowered.
// The lowered call now carries two value arguments and no type argument, so
// isAddOptionsSugarCall rejects it and the whole file must come back unchanged; a
// stage that rebuilt the tree here would spin the loop to FIXED_POINT_EXHAUSTED.
// The nameoftransform table-driven no-op test cannot reach this: its fixture
// carries no addOptions sugar, so this stage is inert there for want of a match,
// never against output it itself produced.
func TestAddOptionsStageLowersAndIsIdempotent(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface UserOptions { name: string; }
services.addOptions<UserOptions>();
`
	prog, app := buildOptionsWitnessWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	ctx := plugin.NewContext(prog, app)
	var diags []plugin.Diagnostic
	transform := AddOptionsTransform(prog, ctx, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()

	sf := mainOptionsSF(t, prog)
	first := transform(ec, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics lowering addOptions<UserOptions>(): %+v", diags)
	}
	if first == sf {
		t.Fatal("addOptions stage did not lower the sugar — the idempotence check needs a real lowering to re-run over")
	}
	shimast.SetParentInChildrenUnset(first.AsNode())

	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(first.AsNode(), first, writer, nil)
	lowered := writer.String()
	if !strings.Contains(lowered, `.addOptions("@rhombus-std/options:IOptions<@scope/app/main:UserOptions>", "@scope/app/main:UserOptions")`) {
		t.Fatalf("addOptions<UserOptions>() did not lower to the two-token verb:\n%s", lowered)
	}

	second := transform(ec, first)
	if second != first {
		t.Errorf("addOptions stage re-fired on its own lowered output (returned %p, want %p) — the fixed-point loop would never terminate", second, first)
	}
}

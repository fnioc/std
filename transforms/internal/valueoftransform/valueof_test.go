package valueoftransform

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

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// buildValueofWorkspace stands up a workspace exporting the authoring-only
// `valueof<T>()` literal-value primitive and a `main.ts` with source-written calls.
func buildValueofWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	prims := filepath.Join(root, "packages", "prims")
	write(t, filepath.Join(prims, "package.json"), `{
  "name": "@scope/prims",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	write(t, filepath.Join(prims, "src", "index.ts"), `export declare function valueof<T>(): T;
export declare const keep: number;
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	link := filepath.Join(app, "node_modules", "@scope", "prims")
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(prims, link); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(app, "main.ts"), mainSrc)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "node_modules/@scope/prims/src/index.ts"]
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

func mainSourceFile(t *testing.T, prog *driver.Program) *shimast.SourceFile {
	t.Helper()
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "main.ts") {
			return sf
		}
	}
	t.Fatal("main.ts not found")
	return nil
}

func lowerMain(t *testing.T, prog *driver.Program, app string) string {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	transform := New(prog, ctx, nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := transform(ec, mainSourceFile(t, prog))
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(out.AsNode(), out, writer, nil)
	return writer.String()
}

// TestValueofLowersLiteralKinds drives the source-written path over the literal
// kinds the `.as<Scope>()` sugar (and general use) exercises: a string scope, a
// number, and a boolean each lower to their bare value expression, and the import
// is elided.
func TestValueofLowersLiteralKinds(t *testing.T) {
	mainSrc := `import { valueof, keep } from '@scope/prims';
export const s = valueof<'scoped'>();
export const n = valueof<42>();
export const b = valueof<true>();
export const k = keep;
`
	prog, app := buildValueofWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out := lowerMain(t, prog, app)

	if !strings.Contains(out, `s = "scoped"`) {
		t.Errorf("valueof<'scoped'> did not lower to the string value:\n%s", out)
	}
	if !strings.Contains(out, `n = 42`) {
		t.Errorf("valueof<42> did not lower to the numeric value:\n%s", out)
	}
	if !strings.Contains(out, `b = true`) {
		t.Errorf("valueof<true> did not lower to the boolean value:\n%s", out)
	}
	if strings.Contains(out, "valueof") {
		t.Errorf("a valueof reference / import survived lowering:\n%s", out)
	}
	if !strings.Contains(out, `k = keep`) {
		t.Errorf("the unrelated `keep` binding was disturbed:\n%s", out)
	}
}

// TestValueofNonSingletonLeftInPlace covers the guard: a non-singular type
// argument (a wide union) yields no value, so the call is left in place for the
// emit sweep.
func TestValueofNonSingletonLeftInPlace(t *testing.T) {
	mainSrc := `import { valueof } from '@scope/prims';
export const u = valueof<'a' | 'b'>();
`
	prog, app := buildValueofWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out := lowerMain(t, prog, app)
	if !strings.Contains(out, "valueof") {
		t.Fatalf("a non-singular valueof should be left in place for the sweep, got:\n%s", out)
	}
}

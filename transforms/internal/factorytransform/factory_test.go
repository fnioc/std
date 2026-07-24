package factorytransform

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

// buildFactoryWorkspace stands up a `@scope/prims` package exporting the three
// factory primitives (and a `resolveFactory` receiver) plus a consumer main.ts,
// so the stage can be driven source-written over real checker types.
func buildFactoryWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)
	prims := filepath.Join(root, "packages", "prims")
	write(t, filepath.Join(prims, "package.json"), `{
  "name": "@scope/prims",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	write(t, filepath.Join(prims, "src", "index.ts"), `export declare function isFactory<T>(): boolean;
export declare function returntokenfor<T>(): string;
export declare function paramtokensfor<T>(): readonly string[];
export declare function resolveFactory(token: string, params?: readonly string[]): unknown;
`)
	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	link := filepath.Join(app, "node_modules", "@scope/prims")
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(prims, link); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(app, "main.ts"), mainSrc)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": { "target": "ES2022", "module": "esnext", "moduleResolution": "bundler", "strict": true, "noEmit": true, "skipLibCheck": true },
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

func lowerFactory(t *testing.T, prog *driver.Program, app string) (string, []plugin.Diagnostic) {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	var diags []plugin.Diagnostic
	transform := New(prog, ctx, nil, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	var main *shimast.SourceFile
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "main.ts") {
			main = sf
		}
	}
	if main == nil {
		t.Fatal("main.ts not found")
	}
	out := transform(ec, main)
	w := shimprinter.NewTextWriter("\n", 0)
	shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec).Write(out.AsNode(), out, w, nil)
	return w.String(), diags
}

// TestFactoryPrimitivesLowerSourceWritten is the factory stage's direct unit test
// (the package carried none — it was exercised only end-to-end through the inline
// resolve bodies). It drives every primitive source-written over real types:
//
//   - isFactory<F>() → `true` for a function type, `false` for a non-function;
//   - returntokenfor<F>() → the return type's token literal;
//   - resolveFactory(returntokenfor<F>(), paramtokensfor<F>()) → the param-token
//     array spliced in; and for a no-parameter factory the trailing paramtokensfor
//     argument is ELIDED (the bare `resolveFactory(token)` di.core emits).
func TestFactoryPrimitivesLowerSourceWritten(t *testing.T) {
	mainSrc := `import { isFactory, returntokenfor, paramtokensfor, resolveFactory } from '@scope/prims';
interface IDep {}
interface IThing {}
type WithParam = (dep: IDep) => IThing;
type NoParam = () => IThing;
export const isf = isFactory<WithParam>();
export const isn = isFactory<IThing>();
export const rt = returntokenfor<WithParam>();
export const withArgs = resolveFactory(returntokenfor<WithParam>(), paramtokensfor<WithParam>());
export const noArgs = resolveFactory(returntokenfor<NoParam>(), paramtokensfor<NoParam>());
`
	prog, app := buildFactoryWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerFactory(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	for _, want := range []string{
		`isf = true`,
		`isn = false`,
		`rt = "@scope/app/main:IThing"`,
		`withArgs = resolveFactory("@scope/app/main:IThing", ["@scope/app/main:IDep"])`,
		`noArgs = resolveFactory("@scope/app/main:IThing")`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in the lowered output:\n%s", want, out)
		}
	}
	// The primitive imports are elided once every reference is lowered.
	for _, gone := range []string{"isFactory", "returntokenfor", "paramtokensfor"} {
		if strings.Contains(out, gone) {
			t.Errorf("the %s import/reference was not elided:\n%s", gone, out)
		}
	}
}

// TestFactoryParamUnderivableReportsDiagnostic covers the failure path: a factory
// parameter whose type has no derivable token (an anonymous object type) raises the
// targeted 990030 diagnostic anchored at the call's source file — never a silent
// empty token. Exercises paramTokenLits's emit branch and anchorFile.
func TestFactoryParamUnderivableReportsDiagnostic(t *testing.T) {
	mainSrc := `import { paramtokensfor } from '@scope/prims';
interface IThing {}
type Bad = (dep: { readonly a: number }) => IThing;
export const p = paramtokensfor<Bad>();
`
	prog, app := buildFactoryWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerFactory(t, prog, app)
	var found *plugin.Diagnostic
	for i := range diags {
		if diags[i].Code == factoryParamUnderivableCode {
			found = &diags[i]
		}
	}
	if found == nil {
		t.Fatalf("expected a %s factory-param-underivable diagnostic, got %+v", factoryParamUnderivableCode, diags)
	}
	if !strings.HasSuffix(found.File, "main.ts") {
		t.Errorf("diagnostic should be anchored in main.ts, got File=%q", found.File)
	}
	// The bare, non-trailing paramtokensfor lowers to an empty array once the
	// underivable param drops out — the loud diagnostic, not a silent survivor.
	if strings.Contains(out, "paramtokensfor") {
		t.Errorf("the failed paramtokensfor call should not survive verbatim:\n%s", out)
	}
}

package schemaoftransform

// Byte-parity + behavior tests for the schemaof primitive stage against its
// oracle, the config `.withType` stage. Both drive the SAME schema walk
// (internal/schema) and the SAME value-import materialization
// (internal/valueimport), so the produced literal is identical by construction;
// these tests pin the STAGE wiring around it — artifacts vs source-written
// anchoring, the call-node replacement, OPTIONAL import injection, the targeted
// failure diagnostics, and loop stability.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/schema"
)

// ambient mirrors the config e2e's fake barrel plus a `schemaof` global, so a
// source-written `schemaof<T>()` resolves to a symbol named schemaof and a
// `<b>.withType<T>()` resolves to the ConfigBuilder augmentation the oracle stage
// matches — the two paths lowered over ONE program, ONE checker.
const ambient = `declare module "@rhombus-std/config" {
  export const OPTIONAL: unique symbol;
  export class ConfigBuilder<T = unknown> {
    withSchema(schema: unknown): ConfigBuilder<unknown>;
  }
  export interface ConfigBuilder<T = unknown> {
    withType<U>(): ConfigBuilder<U>;
  }
}
declare function schemaof<T>(): unknown;
`

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// loadProgram writes the ambient module + a main.ts and loads a checked program.
func loadProgram(t *testing.T, mainSrc string) (*driver.Program, *shimast.SourceFile) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "lib": ["ES2022"], "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["ambient.d.ts", "main.ts"]
}
`)
	writeFile(t, filepath.Join(root, "ambient.d.ts"), ambient)
	writeFile(t, filepath.Join(root, "main.ts"), mainSrc)

	prog, diags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("program diagnostics: %v", diags)
	}
	if prog.Checker == nil {
		t.Fatal("no checker")
	}
	var main *shimast.SourceFile
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "main.ts") {
			main = sf
		}
	}
	if main == nil {
		t.Fatal("main.ts not found")
	}
	return prog, main
}

func reprint(ec *shimprinter.EmitContext, sf *shimast.SourceFile) string {
	shimast.SetParentInChildrenUnset(sf.AsNode())
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(sf.AsNode(), sf, writer, nil)
	return writer.String()
}

// lowerSchemaof runs the schemaof stage (source-written anchoring, artifacts=nil)
// over main.ts and returns the reprinted output plus diagnostics.
func lowerSchemaof(t *testing.T, prog *driver.Program, sf *shimast.SourceFile) (string, []plugin.Diagnostic) {
	t.Helper()
	var diags []plugin.Diagnostic
	transform := New(prog, nil, nil, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	return reprint(ec, transform(ec, sf)), diags
}

// lowerWithType runs the config oracle stage over main.ts and returns the
// reprinted output plus diagnostics.
func lowerWithType(t *testing.T, prog *driver.Program, sf *shimast.SourceFile) (string, []plugin.Diagnostic) {
	t.Helper()
	var diags []plugin.Diagnostic
	transform := configtransform.New(prog, nil, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	return reprint(ec, transform(ec, sf)), diags
}

// bracedAfter extracts the balanced `{...}` object literal that follows marker in
// s (the schema literal), so the two stages' literals can be compared free of
// their differing surrounding syntax (`.withSchema({…})` vs `= {…}`).
func bracedAfter(t *testing.T, s, marker string) string {
	t.Helper()
	i := strings.Index(s, marker)
	if i < 0 {
		t.Fatalf("marker %q not found in:\n%s", marker, s)
	}
	rest := s[i+len(marker):]
	open := strings.IndexByte(rest, '{')
	if open < 0 {
		t.Fatalf("no `{` after %q in:\n%s", marker, s)
	}
	depth := 0
	for j := open; j < len(rest); j++ {
		switch rest[j] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return rest[open : j+1]
			}
		}
	}
	t.Fatalf("unbalanced braces after %q in:\n%s", marker, s)
	return ""
}

// TestSchemaofMatchesWithTypeOracle drives the SAME type T through both stages
// over one program and asserts the produced schema literals are byte-identical —
// nested records, casing, wide-boolean-before-union, and the optional OPTIONAL
// wrapper, the four correctness invariants the walk owns.
func TestSchemaofMatchesWithTypeOracle(t *testing.T) {
	cases := []struct {
		name  string
		iface string
	}{
		{"flat-leaves", `s: string; n: number; b: boolean`},
		{"nested-casing", `Server: { Host: string; Port: number }`},
		{"deep-nested", `Database: { Primary: { Host: string; PoolSize: number } }`},
		{"optional-boolean", `ssl?: boolean`},
		{"optional-and-required", `host: string; port: number; ssl?: boolean`},
		{"wide-boolean-not-union", `flag: boolean`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			src := `import { ConfigBuilder } from "@rhombus-std/config";
interface C { ` + tc.iface + ` }
declare const b: ConfigBuilder;
export const viaWithType = b.withType<C>();
export const viaSchemaof = schemaof<C>();
`
			prog, sf := loadProgram(t, src)
			defer func() { _ = prog.Close() }()

			wtOut, wtDiags := lowerWithType(t, prog, sf)
			soOut, soDiags := lowerSchemaof(t, prog, sf)
			if len(wtDiags) != 0 || len(soDiags) != 0 {
				t.Fatalf("unexpected diagnostics: withType=%v schemaof=%v", wtDiags, soDiags)
			}

			wtLit := bracedAfter(t, wtOut, ".withSchema(")
			soLit := bracedAfter(t, soOut, "viaSchemaof = ")
			if wtLit != soLit {
				t.Errorf("schema literal mismatch:\n withType:  %s\n schemaof:  %s", wtLit, soLit)
			}
			if strings.Contains(soOut, "schemaof<") {
				t.Errorf("schemaof call not lowered:\n%s", soOut)
			}
		})
	}
}

// TestSchemaofInjectsOptionalImport: an optional field wraps as
// `{ [OPTIONAL]: … }` and — parity with the oracle — injects the named OPTIONAL
// import, byte-identical to the config stage's.
func TestSchemaofInjectsOptionalImport(t *testing.T) {
	src := `interface C { ssl?: boolean }
export const s = schemaof<C>();
`
	prog, sf := loadProgram(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerSchemaof(t, prog, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	if !strings.Contains(out, `ssl: { [OPTIONAL]: "boolean" }`) {
		t.Errorf("optional field not wrapped:\n%s", out)
	}
	if !strings.Contains(out, `import { OPTIONAL } from "@rhombus-std/config"`) {
		t.Errorf("named OPTIONAL import not injected:\n%s", out)
	}
}

// TestSchemaofHonorsExistingOptionalBinding: an existing aliased OPTIONAL import
// is honored (referenced by its local name), and no second import is injected —
// the generic value-import materialization's alias path.
func TestSchemaofHonorsExistingOptionalBinding(t *testing.T) {
	src := `import { OPTIONAL as Opt } from "@rhombus-std/config";
void Opt;
interface C { ssl?: boolean }
export const s = schemaof<C>();
`
	prog, sf := loadProgram(t, src)
	defer func() { _ = prog.Close() }()

	out, _ := lowerSchemaof(t, prog, sf)
	if !strings.Contains(out, `ssl: { [Opt]: "boolean" }`) {
		t.Errorf("aliased OPTIONAL binding not honored:\n%s", out)
	}
	if strings.Contains(out, `import { OPTIONAL }`) {
		t.Errorf("must not inject a second OPTIONAL import:\n%s", out)
	}
}

// TestSchemaofNoOptionalNoImport: a schema with no optional field injects no
// import (Used stays false).
func TestSchemaofNoOptionalNoImport(t *testing.T) {
	src := `interface C { host: string }
export const s = schemaof<C>();
`
	prog, sf := loadProgram(t, src)
	defer func() { _ = prog.Close() }()

	out, _ := lowerSchemaof(t, prog, sf)
	if strings.Contains(out, "import { OPTIONAL }") {
		t.Errorf("unexpected injected OPTIONAL import:\n%s", out)
	}
}

// TestSchemaofRejections walks every unsupported field shape and the non-object
// root: each raises the SAME targeted code the oracle does (992001 / 992002) and
// leaves the `schemaof<T>()` call UN-LOWERED — never a silent partial, never the
// generic sweep error.
func TestSchemaofRejections(t *testing.T) {
	cases := []struct {
		name     string
		iface    string
		root     string
		wantCode string
	}{
		{"mixed-union", `mode: string | number`, "C", schema.CodeUnsupportedType},
		{"string-literal-union", `mode: "a" | "b"`, "C", schema.CodeUnsupportedType},
		{"array", `tags: string[]`, "C", schema.CodeUnsupportedType},
		{"tuple", `pair: [string, number]`, "C", schema.CodeUnsupportedType},
		{"function", `fn: () => void`, "C", schema.CodeUnsupportedType},
		{"index-signature", `bag: { [k: string]: string }`, "C", schema.CodeUnsupportedType},
		{"library-global-date", `when: Date`, "C", schema.CodeUnsupportedType},
		{"non-object-root", ``, "string", schema.CodeNonObjectRoot},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var src string
			if tc.root == "string" {
				src = "export const s = schemaof<string>();\n"
			} else {
				src = `interface C { ` + tc.iface + ` }
export const s = schemaof<C>();
`
			}
			prog, sf := loadProgram(t, src)
			defer func() { _ = prog.Close() }()

			out, diags := lowerSchemaof(t, prog, sf)
			if len(diags) == 0 {
				t.Fatalf("expected a diagnostic for %s, got none:\n%s", tc.name, out)
			}
			if diags[0].Code != tc.wantCode {
				t.Errorf("code = %q, want %q", diags[0].Code, tc.wantCode)
			}
			if !strings.Contains(out, "schemaof<") {
				t.Errorf("unsupported shape must leave the call un-lowered:\n%s", out)
			}
			if strings.Contains(out, "[OPTIONAL]") {
				t.Errorf("no partial rewrite allowed:\n%s", out)
			}
		})
	}
}

// TestSchemaofFailureEmitsOncePerNode pins the loop-dedupe contract: re-running
// the stage over its own un-lowered output (the shape the fixed-point loop hands
// back every pass) must NOT re-emit the failure diagnostic — a per-run set keyed
// on the surviving call node emits exactly once.
func TestSchemaofFailureEmitsOncePerNode(t *testing.T) {
	src := `interface C { tags: string[] }
export const s = schemaof<C>();
`
	prog, sf := loadProgram(t, src)
	defer func() { _ = prog.Close() }()

	var diags []plugin.Diagnostic
	transform := New(prog, nil, nil, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()

	first := transform(ec, sf)
	if got := len(diags); got != 1 {
		t.Fatalf("pass 1 emitted %d diagnostics, want 1", got)
	}
	shimast.SetParentInChildrenUnset(first.AsNode())
	second := transform(ec, first)
	if got := len(diags); got != 1 {
		t.Errorf("pass 2 re-emitted the failure (total %d), want 1 — the loop-dedupe failed", got)
	}
	if second != first {
		t.Errorf("stage re-fired on its own un-lowered output (returned %p, want %p)", second, first)
	}
}

// TestSchemaofSettlesUnderLoop drives the schemaof stage through the real
// fixed-point runner and asserts it settles (does not exhaust) with the schema
// literal fully lowered and the OPTIONAL import injected once, then is a no-op on
// the settled tree.
func TestSchemaofSettlesUnderLoop(t *testing.T) {
	src := `interface C { host: string; ssl?: boolean }
export const s = schemaof<C>();
`
	prog, sf := loadProgram(t, src)
	defer func() { _ = prog.Close() }()

	ec := shimprinter.NewEmitContext()
	stage := New(prog, nil, nil, func(plugin.Diagnostic) {})
	settled, passes, exhausted := plugin.RunToFixedPoint(ec, []plugin.FileTransform{stage}, sf, 16)
	if exhausted {
		t.Fatal("schemaof stage exhausted maxPasses — not identity-preserving on a no-op")
	}
	if passes > 3 {
		t.Errorf("settled in %d passes, expected <= 3", passes)
	}
	out := reprint(ec, settled)
	if strings.Contains(out, "schemaof<") {
		t.Errorf("schemaof not lowered after settle:\n%s", out)
	}
	if strings.Count(out, `import { OPTIONAL }`) != 1 {
		t.Errorf("expected exactly one injected OPTIONAL import:\n%s", out)
	}
	// Re-run once over the settled tree: identical pointer (no-op).
	if again := stage(ec, settled); again != settled {
		t.Errorf("schemaof re-fired on settled output (returned %p, want %p)", again, settled)
	}
}

// TestSchemaofArtifactsAnchoringMatchesSourceWritten proves the PRIMARY (inline)
// anchoring path: the same `schemaof<T>()` node lowered via the artifacts branch
// (a registered PrimitiveUse carrying the bound type) produces output identical to
// the source-written branch. This is the branch the inline `.withType` body
// exercises in production, where the substituted callee carries no checker symbol.
func TestSchemaofArtifactsAnchoringMatchesSourceWritten(t *testing.T) {
	src := `interface C { host: string; ssl?: boolean }
export const s = schemaof<C>();
`
	prog, sfSource := loadProgram(t, src)
	defer func() { _ = prog.Close() }()
	sourceOut, _ := lowerSchemaof(t, prog, sfSource)

	// Reload a fresh program so the artifacts run starts from an un-lowered tree.
	prog2, sf2 := loadProgram(t, src)
	defer func() { _ = prog2.Close() }()

	call := findCall(sf2.AsNode(), func(c *shimast.CallExpression) bool {
		return c.Expression.Kind == shimast.KindIdentifier && c.Expression.Text() == "schemaof"
	})
	if call == nil {
		t.Fatal("schemaof call not found in fixture")
	}
	typeArg := call.AsCallExpression().TypeArguments.Nodes[0]
	boundType := prog2.Checker.GetTypeFromTypeNode(typeArg)

	artifacts := inlinetransform.NewArtifacts()
	artifacts.Active = true
	artifacts.PrimitiveCalls[call] = inlinetransform.PrimitiveUse{
		Name:     "schemaof",
		TypeArgs: []*shimchecker.Type{boundType},
	}

	var diags []plugin.Diagnostic
	transform := New(prog2, nil, artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	artifactsOut := reprint(ec, transform(ec, sf2))
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics on artifacts path: %v", diags)
	}
	if bracedAfter(t, artifactsOut, "s = ") != bracedAfter(t, sourceOut, "s = ") {
		t.Errorf("artifacts-anchored literal differs from source-written:\n artifacts: %s\n source:    %s",
			bracedAfter(t, artifactsOut, "s = "), bracedAfter(t, sourceOut, "s = "))
	}
}

// findCall returns the first CallExpression (pre-order) satisfying pred, or nil.
func findCall(root *shimast.Node, pred func(*shimast.CallExpression) bool) *shimast.Node {
	var found *shimast.Node
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil || found != nil {
			return
		}
		if n.Kind == shimast.KindCallExpression && pred(n.AsCallExpression()) {
			found = n
			return
		}
		n.ForEachChild(func(child *shimast.Node) bool {
			walk(child)
			return found != nil
		})
	}
	walk(root)
	return found
}

package configtransform

// Checker-backed end-to-end tests for the schema codegen (schemaLiteralForTypeNode
// / schemaForType / objectLiteralForType / isAcceptableRecord / isLibraryOrExternal),
// driven the way the nameof/signature suites drive their stage: a LoadProgram
// TempDir fixture whose `main.ts` calls `.withType<T>()`, lowered through New and
// reprinted, then the lowered `withSchema({...})` (or the raised diagnostic) is
// asserted. Plus the pure, checker-free helpers (isUnderNodeModules, jsIdentifier,
// propertyKey).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// configAmbient mirrors the e2e's CONFIG_AMBIENT: the ambient `@rhombus-std/config`
// module carrying OPTIONAL, the ConfigBuilder runtime class, and the same-name
// interface that declaration-merges `withType<U>()`. The matcher anchors on this
// interface's `withType` declaration, so a receiver lowers because its `withType`
// resolves back here.
const configAmbient = `declare module "@rhombus-std/config" {
  export const OPTIONAL: unique symbol;
  export class ConfigBuilder<T = unknown> {
    add(source: unknown): this;
    withSchema(schema: unknown): ConfigBuilder<unknown>;
  }
  export interface ConfigBuilder<T = unknown> {
    withType<U>(): ConfigBuilder<U>;
  }
}
`

// loadConfigProgram writes the ambient module + a main.ts and loads a checked
// program; it returns the program and its main source file.
func loadConfigProgram(t *testing.T, mainSrc string) (*driver.Program, *shimast.SourceFile) {
	t.Helper()
	root := t.TempDir()
	writeConfigFile(t, filepath.Join(root, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "files": ["config.ambient.d.ts", "main.ts"]
}
`)
	writeConfigFile(t, filepath.Join(root, "config.ambient.d.ts"), configAmbient)
	writeConfigFile(t, filepath.Join(root, "main.ts"), mainSrc)

	prog, diags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("config diagnostics: %v", diags)
	}
	if prog.Checker == nil {
		t.Fatal("LoadProgram did not acquire a checker")
	}
	return prog, mainConfigSF(t, prog)
}

func writeConfigFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mainConfigSF(t *testing.T, prog *driver.Program) *shimast.SourceFile {
	t.Helper()
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), "main.ts") {
			return sf
		}
	}
	t.Fatal("main.ts not found")
	return nil
}

// reprintConfigSF prints a source file back through the emit pipeline the host
// uses, fixing up parent pointers on the mixed original/synthetic tree first.
func reprintConfigSF(ec *shimprinter.EmitContext, sf *shimast.SourceFile) string {
	shimast.SetParentInChildrenUnset(sf.AsNode())
	writer := shimprinter.NewTextWriter("\n", 0)
	printer := shimprinter.NewPrinter(shimprinter.PrinterOptions{}, shimprinter.PrintHandlers{}, ec)
	printer.Write(sf.AsNode(), sf, writer, nil)
	return writer.String()
}

// lowerConfig runs the config stage (New) over main.ts and returns the reprinted
// output plus any raised diagnostics.
func lowerConfig(t *testing.T, prog *driver.Program, sf *shimast.SourceFile) (string, []plugin.Diagnostic) {
	t.Helper()
	var diags []plugin.Diagnostic
	transform := New(prog, nil, func(d plugin.Diagnostic) {
		diags = append(diags, d)
	})
	ec := shimprinter.NewEmitContext()
	out := transform(ec, sf)
	return reprintConfigSF(ec, out), diags
}

// newConfigFactory returns a node factory of the same kind New uses internally.
func newConfigFactory() *shimast.NodeFactory {
	return shimprinter.NewEmitContext().Factory.AsNodeFactory()
}

// sideParseConfig side-parses standalone TS (no checker) into a SourceFile through
// an absolute virtual name (a non-absolute name panics NewSourceFile).
func sideParseConfig(t *testing.T, text string) *shimast.SourceFile {
	t.Helper()
	sf := inlinetransform.SideParse("/virtual/x.ts", text)
	if sf == nil {
		t.Fatal("SideParse returned nil")
	}
	return sf
}

// findConfigNode returns the first node (pre-order) satisfying pred, or nil.
func findConfigNode(sf *shimast.SourceFile, pred func(*shimast.Node) bool) *shimast.Node {
	var found *shimast.Node
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil || found != nil {
			return
		}
		if pred(n) {
			found = n
			return
		}
		n.ForEachChild(func(child *shimast.Node) bool {
			walk(child)
			return found != nil
		})
	}
	walk(sf.AsNode())
	return found
}

// ── end-to-end schema lowering ──────────────────────────────────────────────

// TestLowerLeaves pins the three leaf classifications and the LOAD-BEARING order:
// a required `boolean` is classified "boolean" (it carries both Union and Boolean
// flags) and must NOT diagnose.
func TestLowerLeaves(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface C { s: string; n: number; b: boolean }
export const r = new ConfigBuilder().withType<C>();
`)
	defer func() { _ = prog.Close() }()

	out, diags := lowerConfig(t, prog, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	for _, want := range []string{`s: "string"`, `n: "number"`, `b: "boolean"`, ".withSchema("} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in:\n%s", want, out)
		}
	}
	if strings.Contains(out, ".withType") {
		t.Errorf("call not rewritten (still has .withType):\n%s", out)
	}
	if strings.Contains(out, "withSchema<") {
		t.Errorf("type argument not dropped (withSchema<...>):\n%s", out)
	}
}

// TestLowerNestedRecord: a nested object field recurses into a nested object
// literal, casing preserved (`Host` stays `Host`).
func TestLowerNestedRecord(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface C { Server: { Host: string; Port: number } }
export const r = new ConfigBuilder().withType<C>();
`)
	defer func() { _ = prog.Close() }()

	out, diags := lowerConfig(t, prog, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	for _, want := range []string{`Host: "string"`, `Port: "number"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in:\n%s", want, out)
		}
	}
}

// TestLowerOptionalField: `x?: string` wraps as `{ [OPTIONAL]: "string" }` (the
// `| undefined` stripped by GetNonNullableType before recursing) and flips
// optionalRef.used, so ensureOptionalImport injects the named OPTIONAL import.
func TestLowerOptionalField(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface C { x?: string }
export const r = new ConfigBuilder().withType<C>();
`)
	defer func() { _ = prog.Close() }()

	out, diags := lowerConfig(t, prog, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	if !strings.Contains(out, `x: { [OPTIONAL]: "string" }`) {
		t.Errorf("optional field not wrapped:\n%s", out)
	}
	if !strings.Contains(out, `import { OPTIONAL } from "@rhombus-std/config"`) {
		t.Errorf("named OPTIONAL import not injected:\n%s", out)
	}
}

// TestLowerNoOptionalNoImport: a schema with no optional field injects no import.
func TestLowerNoOptionalNoImport(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface C { host: string }
export const r = new ConfigBuilder().withType<C>();
`)
	defer func() { _ = prog.Close() }()

	out, diags := lowerConfig(t, prog, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	if strings.Contains(out, "import { OPTIONAL }") {
		t.Errorf("unexpected injected OPTIONAL import:\n%s", out)
	}
}

// TestLowerNestedWithTypeInnerFirst: two chained withType calls both lower, the
// depth-first walk rewriting the inner receiver before the outer.
func TestLowerNestedWithTypeInnerFirst(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface A { a: string }
interface B { b: number }
export const r = new ConfigBuilder().withType<A>().withType<B>();
`)
	defer func() { _ = prog.Close() }()

	out, diags := lowerConfig(t, prog, sf)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	if strings.Contains(out, ".withType") {
		t.Errorf("nested withType not fully lowered:\n%s", out)
	}
	if got := strings.Count(out, ".withSchema("); got != 2 {
		t.Errorf("expected 2 withSchema calls, got %d:\n%s", got, out)
	}
	if !strings.Contains(out, `a: "string"`) || !strings.Contains(out, `b: "number"`) {
		t.Errorf("inner/outer schema literals missing:\n%s", out)
	}
}

// TestLowerUnsupported walks every unsupported field shape: each raises
// codeUnsupportedType (992001) and leaves the ORIGINAL `.withType<...>()` call in
// place — never a silent partial.
func TestLowerUnsupported(t *testing.T) {
	cases := []struct {
		name  string
		field string
	}{
		{"string-literal-union", `mode: "a" | "b"`},
		{"mixed-union", `mode: string | number`},
		{"array", `tags: string[]`},
		{"tuple", `pair: [string, number]`},
		{"function", `fn: () => void`},
		{"index-signature", `bag: { [k: string]: string }`},
		{"library-global-date", `when: Date`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
interface C { `+tc.field+` }
export const r = new ConfigBuilder().withType<C>();
`)
			defer func() { _ = prog.Close() }()

			out, diags := lowerConfig(t, prog, sf)
			if len(diags) == 0 {
				t.Fatalf("expected a diagnostic for %s, got none:\n%s", tc.name, out)
			}
			if diags[0].Code != codeUnsupportedType {
				t.Errorf("code = %q, want %q (992001)", diags[0].Code, codeUnsupportedType)
			}
			if !strings.Contains(out, ".withType<C>()") {
				t.Errorf("unsupported shape must leave the call un-rewritten:\n%s", out)
			}
			if strings.Contains(out, ".withSchema(") {
				t.Errorf("no partial rewrite allowed, but withSchema emitted:\n%s", out)
			}
		})
	}
}

// TestLowerNonObjectRoot: a bare leaf type argument (`withType<string>()`) raises
// codeNonObjectRoot (992002) and leaves the call un-rewritten.
func TestLowerNonObjectRoot(t *testing.T) {
	prog, sf := loadConfigProgram(t, `import { ConfigBuilder } from "@rhombus-std/config";
export const r = new ConfigBuilder().withType<string>();
`)
	defer func() { _ = prog.Close() }()

	out, diags := lowerConfig(t, prog, sf)
	if len(diags) == 0 {
		t.Fatalf("expected a diagnostic, got none:\n%s", out)
	}
	if diags[0].Code != codeNonObjectRoot {
		t.Errorf("code = %q, want %q (992002)", diags[0].Code, codeNonObjectRoot)
	}
	if !strings.Contains(out, ".withType<string>()") {
		t.Errorf("non-object root must leave the call un-rewritten:\n%s", out)
	}
}

// ── pure helpers (no checker / no factory) ──────────────────────────────────

func TestIsUnderNodeModules(t *testing.T) {
	cases := []struct {
		fileName string
		want     bool
	}{
		{"/proj/node_modules/pkg/index.d.ts", true},
		{"/home/x/node_modules/@scope/p/lib.d.ts", true},
		{"/proj/src/main.ts", false},
		{"/proj/node_modulesish/x.ts", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := isUnderNodeModules(tc.fileName); got != tc.want {
			t.Errorf("isUnderNodeModules(%q) = %v, want %v", tc.fileName, got, tc.want)
		}
	}
}

func TestJsIdentifierRegex(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"Host", true},
		{"_x", true},
		{"$a", true},
		{"a1", true},
		{"1a", false},
		{"a-b", false},
		{"", false},
		{"a.b", false},
	}
	for _, tc := range cases {
		if got := jsIdentifier.MatchString(tc.name); got != tc.want {
			t.Errorf("jsIdentifier.MatchString(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

// TestPropertyKey: a valid JS identifier becomes an Identifier (casing preserved),
// an invalid one a StringLiteral.
func TestPropertyKey(t *testing.T) {
	f := newConfigFactory()

	host := propertyKey(f, "Host")
	if host.Kind != shimast.KindIdentifier {
		t.Errorf("propertyKey(Host).Kind = %v, want Identifier", host.Kind)
	}
	if host.Text() != "Host" {
		t.Errorf("propertyKey casing not preserved: %q, want Host", host.Text())
	}

	for _, name := range []string{"kebab-case", "123"} {
		key := propertyKey(f, name)
		if key.Kind != shimast.KindStringLiteral {
			t.Errorf("propertyKey(%q).Kind = %v, want StringLiteral", name, key.Kind)
		}
	}
}

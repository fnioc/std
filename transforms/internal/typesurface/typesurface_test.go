package typesurface

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"
	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// load writes a one-file strict project, loads it, and returns the checker plus
// the declared type of `export declare const probe: <name>`.
func load(t *testing.T, source, name string) (*driver.Program, *shimchecker.Checker, *shimchecker.Type) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "app.ts"), source+"\nexport declare const probe: "+name+";\n")
	write(t, filepath.Join(root, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["app.ts"]
}`)
	prog, diags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatalf("LoadProgram: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("config diagnostics: %v", diags)
	}
	var probe *shimast.Node
	for _, sf := range prog.SourceFiles() {
		if !strings.HasSuffix(sf.FileName(), "app.ts") {
			continue
		}
		for _, statement := range sf.Statements.Nodes {
			if statement.Kind != shimast.KindVariableStatement {
				continue
			}
			for _, decl := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if decl.Name() != nil && decl.Name().Text() == "probe" {
					probe = decl.AsVariableDeclaration().Type
				}
			}
		}
	}
	if probe == nil {
		t.Fatal("no `probe` declaration in the fixture")
	}
	return prog, prog.Checker, prog.Checker.GetTypeFromTypeNode(probe)
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func names(surface Surface) []string {
	out := make([]string, 0, len(surface.Members))
	for _, m := range surface.Members {
		out = append(out, m.Name)
	}
	return out
}

func TestEnumeratesPublicMembersOnly(t *testing.T) {
	prog, checker, t0 := load(t, `
export class C {
  #hidden: number = 0;
  #alsoHidden: string = "";
  public get hidden(): number { return this.#hidden; }
  public set hidden(v: number) { this.#hidden = v; }
  public plain: string = "";
  public maybe?: number;
  private secret: string = "";
  protected shared: string = "";
  static defaultHost: string = "";
}
`, "C")
	defer func() { _ = prog.Close() }()

	surface := For(checker, t0, nil)
	got := names(surface)
	want := []string{"hidden", "plain", "maybe"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("members = %v; want %v", got, want)
	}
	if surface.PrivateNamed != 2 {
		t.Errorf("PrivateNamed = %d; want 2", surface.PrivateNamed)
	}
	if surface.ModifierHidden != 2 {
		t.Errorf("ModifierHidden = %d; want 2", surface.ModifierHidden)
	}
	if !surface.HasAccessor {
		t.Error("HasAccessor = false; want true (`hidden` is an accessor)")
	}
	for _, m := range surface.Members {
		if m.Name == "maybe" && !m.Optional {
			t.Error("`maybe?` is not reported optional")
		}
		if m.Name == "plain" && m.Optional {
			t.Error("`plain` is reported optional")
		}
	}
}

// An accessor's member type is the type it declares, read at its own declaration.
func TestAccessorMemberTypeIsTheDeclaredAccessorType(t *testing.T) {
	prog, checker, t0 := load(t, `
export class C {
  #value: string = "";
  public get value(): number | undefined { return 1; }
}
`, "C")
	defer func() { _ = prog.Close() }()

	surface := For(checker, t0, nil)
	if len(surface.Members) != 1 {
		t.Fatalf("members = %v; want exactly [value]", names(surface))
	}
	member := surface.Members[0]
	got := checker.TypeToString(checker.GetTypeOfSymbolAtLocation(member.Symbol, member.Decl))
	if got != "number | undefined" {
		t.Errorf("member type = %q; want \"number | undefined\"", got)
	}
}

// An interface has nothing to hide: every member survives and both counts are 0.
func TestInterfaceHidesNothing(t *testing.T) {
	prog, checker, t0 := load(t, `
export interface I { host: string; port: number; }
`, "I")
	defer func() { _ = prog.Close() }()

	surface := For(checker, t0, nil)
	if len(surface.Members) != 2 {
		t.Errorf("members = %v; want [host port]", names(surface))
	}
	if surface.PrivateNamed != 0 || surface.ModifierHidden != 0 {
		t.Errorf("counts = %d/%d; want 0/0", surface.PrivateNamed, surface.ModifierHidden)
	}
	if surface.HasAccessor {
		t.Error("HasAccessor = true for an interface with no accessors")
	}
}

// An accessor is directional, and consumers face opposite ways: a guard reads,
// a schema writes. Both directions have to be reported, or one consumer emits a
// member operation that can never succeed.
func TestAccessorDirectionsAreReportedSeparately(t *testing.T) {
	prog, checker, t0 := load(t, `
export class C {
  #a = 0;
  #b = 0;
  public get readOnly(): number { return this.#a; }
  public set writeOnly(v: number) { this.#b = v; }
  public get both(): number { return this.#a; }
  public set both(v: number) { this.#a = v; }
  public plain: string = "";
}
`, "C")
	defer func() { _ = prog.Close() }()

	surface := For(checker, t0, nil)
	for _, tc := range []struct {
		name               string
		readable, writable bool
	}{
		{"readOnly", true, false},
		{"writeOnly", false, true},
		{"both", true, true},
		{"plain", true, true},
	} {
		var found bool
		for _, m := range surface.Members {
			if m.Name != tc.name {
				continue
			}
			found = true
			if m.Readable != tc.readable || m.Writable != tc.writable {
				t.Errorf("%s: readable/writable = %v/%v; want %v/%v", tc.name, m.Readable, m.Writable, tc.readable, tc.writable)
			}
		}
		if !found {
			t.Errorf("%s absent from the surface %v", tc.name, names(surface))
		}
	}
	if got := len(surface.Readable()); got != 3 {
		t.Errorf("Readable() = %d members; want 3", got)
	}
	if got := len(surface.Writable()); got != 3 {
		t.Errorf("Writable() = %d members; want 3", got)
	}
}

// HiddenOnly is the one refusal predicate every consumer shares: a type that has
// members, none of which can be named from outside it.
func TestHiddenOnly(t *testing.T) {
	prog, checker, t0 := load(t, `
export class Sealed { #a: number = 0; private b: string = ""; }
export interface Empty {}
`, "Sealed")
	defer func() { _ = prog.Close() }()
	if !For(checker, t0, nil).HiddenOnly() {
		t.Error("a class whose every member is hidden does not report HiddenOnly")
	}

	prog2, checker2, t2 := load(t, `export interface Empty {}`, "Empty")
	defer func() { _ = prog2.Close() }()
	if For(checker2, t2, nil).HiddenOnly() {
		t.Error("an empty type reports HiddenOnly; it hides nothing")
	}
}

func TestUnderNodeModules(t *testing.T) {
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
		if got := underNodeModules(tc.fileName); got != tc.want {
			t.Errorf("underNodeModules(%q) = %v, want %v", tc.fileName, got, tc.want)
		}
	}
}

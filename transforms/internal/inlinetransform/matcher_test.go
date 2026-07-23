package inlinetransform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimchecker "github.com/microsoft/typescript-go/shim/checker"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

// The fixture is one program that mirrors the isService pilot's real shape: a
// primitive interface (`core.ts`) whose inlineable member is added by TWO
// `declare module` augmentation files, plus a consumer (`main.ts`) that calls it
// explicitly, in primitive form, and — via a second member — with an INFERRED
// type argument. These probe files ARE the unit tests: each named checker
// composition the inline stage rests on is asserted here.

const fixtureCore = `export interface IServiceManifest {
  isService(token: string): boolean;
}
export declare const manifest: IServiceManifest;
`

// First augmentation file: the inlineable sugar overload of isService (the pilot
// body is ` return this.isService(tokenfor<T>()) `) and a second member `pick`
// whose type parameter appears in a value position so it is INFERABLE.
const fixtureSugar = `declare module './core' {
  interface IServiceManifest {
    isService<T>(): boolean;
    pick<T>(sample: T): T;
  }
}
export {};
`

// Second augmentation file: a THIRD declaration of isService, in a different
// file, so the merged member symbol provably spans three sources. Its arity
// differs from the primitive form to keep primitive-call overload resolution
// unambiguous.
const fixtureSugar2 = `declare module './core' {
  interface IServiceManifest {
    isService<T>(hintA: string, hintB: number): boolean;
  }
}
export {};
`

const fixtureMain = `/// <reference path="./sugar.d.ts" />
/// <reference path="./sugar2.d.ts" />
import { manifest } from './core';

interface Foo { readonly brand: 'foo'; }
declare const theFoo: Foo;

manifest.isService<Foo>();     // explicit sugar — the (a) target
manifest.isService('literal'); // primitive form — matches the member, no type arg to inline
manifest.pick(theFoo);         // inferred T = Foo — the (b) target
`

// isServiceEntry is the pilot publish-list entry, resolved against the fixture's
// relative module. In production the token package part is a bare specifier
// ("@rhombus-std/di.core"); a relative "./core" exercises the identical
// resolution path.
var isServiceEntry = Entry{Type: "./core:IServiceManifest", Impl: "ServiceManifestExtensions", Member: "isService"}

func loadFixture(t *testing.T) (*driver.Program, *shimchecker.Checker, *shimast.SourceFile) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "files": ["main.ts", "core.ts", "sugar.d.ts", "sugar2.d.ts"]
}
`)
	write(t, filepath.Join(root, "core.ts"), fixtureCore)
	write(t, filepath.Join(root, "sugar.d.ts"), fixtureSugar)
	write(t, filepath.Join(root, "sugar2.d.ts"), fixtureSugar2)
	write(t, filepath.Join(root, "main.ts"), fixtureMain)

	prog, diags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected config diagnostics: %v", diags)
	}
	if prog.Checker == nil {
		t.Fatal("LoadProgram did not acquire a checker")
	}
	main := sourceFileWithSuffix(t, prog, "main.ts")
	return prog, prog.Checker, main
}

// TestResolvedSignatureToDeclarationForExplicitCall is probe (a): the whole build
// dies if this fails. It proves the call-site half of matching —
// GetResolvedSignature -> declaration -> set membership — binds an explicit
// `manifest.isService<Foo>()` to the authored sugar overload, which is one of the
// member symbol's merged declarations.
func TestResolvedSignatureToDeclarationForExplicitCall(t *testing.T) {
	prog, checker, main := loadFixture(t)
	defer func() { _ = prog.Close() }()

	resolved, err := ResolveEntry(prog, checker, isServiceEntry)
	if err != nil {
		t.Fatalf("ResolveEntry: %v", err)
	}

	explicit := callContaining(t, main, "isService<Foo>")
	decl := resolvedDeclaration(checker, explicit)
	if decl == nil {
		t.Fatal("GetResolvedSignature -> declaration returned nil for isService<Foo>()")
	}
	if decl.Kind != shimast.KindMethodSignature {
		t.Fatalf("resolved declaration kind = %v, want a method signature", decl.Kind)
	}
	if !resolved.Match(checker, explicit) {
		t.Fatal("explicit isService<Foo>() did not match the resolved entry's declaration set")
	}

	// The resolved overload must be the generic sugar form (one type parameter,
	// zero value parameters) — the body-bearing overload, not the primitive.
	sig := checker.GetResolvedSignature(explicit)
	if got := len(shimchecker.Signature_parameters(sig)); got != 0 {
		t.Fatalf("explicit call resolved to a %d-parameter overload, want the 0-parameter sugar form", got)
	}

	// The primitive form shares the member symbol, so it Matches too — but it is
	// gated OUT of inlining downstream by carrying no recoverable type argument.
	// That gate, not the member match, is the sugar/primitive discriminator.
	primitive := callContaining(t, main, "isService('literal')")
	if !resolved.Match(checker, primitive) {
		t.Fatal("primitive isService('literal') unexpectedly failed member-identity match")
	}
	if _, ok := RecoverTypeArguments(checker, primitive); ok {
		t.Fatal("primitive isService('literal') must yield no type arguments (the inlining gate)")
	}
}

// TestRecoverTypeArgumentsExplicitAndInferred is probe (b): the build dies if
// inferred recovery fails. Explicit `isService<Foo>()` recovers [Foo] from the
// syntactic type argument; inferred `pick(theFoo)` recovers [Foo] from the
// resolved instantiation with NO type argument written.
func TestRecoverTypeArgumentsExplicitAndInferred(t *testing.T) {
	prog, checker, main := loadFixture(t)
	defer func() { _ = prog.Close() }()

	explicit := callContaining(t, main, "isService<Foo>")
	args, ok := RecoverTypeArguments(checker, explicit)
	if !ok {
		t.Fatal("RecoverTypeArguments failed for explicit isService<Foo>()")
	}
	if len(args) != 1 || typeName(checker, args[0]) != "Foo" {
		t.Fatalf("explicit recovery = %v, want [Foo]", typeNames(checker, args))
	}

	inferred := callContaining(t, main, "pick(theFoo)")
	iargs, ok := RecoverTypeArguments(checker, inferred)
	if !ok {
		t.Fatal("RecoverTypeArguments failed for INFERRED pick(theFoo) — kill signal")
	}
	if len(iargs) != 1 || typeName(checker, iargs[0]) != "Foo" {
		t.Fatalf("inferred recovery = %v, want [Foo]", typeNames(checker, iargs))
	}
}

// TestMergedMemberCarriesAllDeclarations is probe (c): the entry's member symbol,
// resolved once, carries EVERY duplicate declaration TS declaration-merging
// unified — the base in core.ts plus both `declare module` augmentations — so the
// declaration set is authoritative regardless of which file a call binds to.
func TestMergedMemberCarriesAllDeclarations(t *testing.T) {
	prog, checker, main := loadFixture(t)
	defer func() { _ = prog.Close() }()

	resolved, err := ResolveEntry(prog, checker, isServiceEntry)
	if err != nil {
		t.Fatalf("ResolveEntry: %v", err)
	}

	if len(resolved.Declarations) != 3 {
		t.Fatalf("merged isService carries %d declarations, want 3 (core + sugar + sugar2)", len(resolved.Declarations))
	}

	files := map[string]bool{}
	for decl := range resolved.Declarations {
		sf := shimast.GetSourceFileOfNode(decl)
		if sf == nil {
			t.Fatal("a merged declaration has no source file")
		}
		files[filepath.Base(sf.FileName())] = true
	}
	for _, want := range []string{"core.ts", "sugar.d.ts", "sugar2.d.ts"} {
		if !files[want] {
			t.Fatalf("merged declaration set missing a declaration from %s; got files %v", want, files)
		}
	}

	// Both a sugar-form and the primitive-form call bind to declarations inside
	// this one set — the merged symbol is the single anchor for every overload.
	if !resolved.Match(checker, callContaining(t, main, "isService<Foo>")) {
		t.Fatal("sugar call not covered by the merged declaration set")
	}
	if !resolved.Match(checker, callContaining(t, main, "isService('literal')")) {
		t.Fatal("primitive call not covered by the merged declaration set")
	}
}

// TestRogueDuplicateIsNotMatched is the identity tripwire: a same-NAMED member on
// an unrelated interface resolves to a declaration OUTSIDE the set, so it does
// not match — matching is by symbol/declaration identity, never by string key.
func TestRogueDuplicateIsNotMatched(t *testing.T) {
	prog, checker, main := loadFixture(t)
	defer func() { _ = prog.Close() }()

	resolved, err := ResolveEntry(prog, checker, isServiceEntry)
	if err != nil {
		t.Fatalf("ResolveEntry: %v", err)
	}

	root := t.TempDir()
	write(t, filepath.Join(root, "tsconfig.json"), `{
  "compilerOptions": { "target": "ES2022", "module": "esnext", "moduleResolution": "bundler", "strict": true, "noEmit": true },
  "files": ["rogue.ts"]
}
`)
	write(t, filepath.Join(root, "rogue.ts"), `interface Other { isService<T>(): boolean; }
declare const other: Other;
other.isService<number>();
`)
	rogueProg, diags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
	if err != nil || len(diags) != 0 {
		t.Fatalf("rogue program load failed: err=%v diags=%v", err, diags)
	}
	defer func() { _ = rogueProg.Close() }()

	rogueMain := sourceFileWithSuffix(t, rogueProg, "rogue.ts")
	rogueCall := callContaining(t, rogueMain, "isService<number>")
	// Matched against the FIXTURE's resolved entry but using the rogue program's
	// checker: an unrelated same-named member is not in the fixture's set.
	if resolved.Match(rogueProg.Checker, rogueCall) {
		t.Fatal("a same-named member on an unrelated interface matched — identity matching is broken")
	}
	_ = main
}

// ── fixture / AST helpers ────────────────────────────────────────────────────

// bodiesFor collects the inline bodies for a fixture consumer dir, failing the
// test on error. Build now takes pre-collected bodies (the host runs the one
// §100 scan for stages and bodies); tests that set up a fixture workspace collect
// through this helper.
func bodiesFor(t *testing.T, cwd string) []OwnedEntry {
	t.Helper()
	owned, err := Collect(cwd)
	if err != nil {
		t.Fatalf("Collect(%s): %v", cwd, err)
	}
	return owned
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func sourceFileWithSuffix(t *testing.T, prog *driver.Program, suffix string) *shimast.SourceFile {
	t.Helper()
	for _, sf := range prog.SourceFiles() {
		if strings.HasSuffix(sf.FileName(), suffix) {
			return sf
		}
	}
	t.Fatalf("source file %q not found", suffix)
	return nil
}

// callContaining returns the first call expression in sf whose source text
// contains needle, failing when none is found.
func callContaining(t *testing.T, sf *shimast.SourceFile, needle string) *shimast.Node {
	t.Helper()
	var found *shimast.Node
	walk(sf.AsNode(), func(node *shimast.Node) bool {
		if node.Kind == shimast.KindCallExpression && strings.Contains(shimast.NodeText(node), needle) {
			found = node
			return true
		}
		return false
	})
	if found == nil {
		t.Fatalf("no call expression containing %q", needle)
	}
	return found
}

func typeName(checker *shimchecker.Checker, t *shimchecker.Type) string {
	if t == nil {
		return "<nil>"
	}
	if sym := t.Symbol(); sym != nil {
		return sym.Name
	}
	return "<anonymous>"
}

func typeNames(checker *shimchecker.Checker, ts []*shimchecker.Type) []string {
	out := make([]string, len(ts))
	for i, t := range ts {
		out[i] = typeName(checker, t)
	}
	return out
}

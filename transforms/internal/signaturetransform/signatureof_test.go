package signaturetransform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
)

// syntheticSignatureofCall builds a factory-minted `signatureof(arg)` call whose
// callee identifier is synthetic (position-less), standing in for the inline
// stage's substituted clone. The factory nodes carry Pos<0, so this drives the
// sourceWrittenArg guard that must NOT reach the checker.
func syntheticSignatureofCall(ec *shimprinter.EmitContext, argCount int) *shimast.Node {
	factory := ec.Factory.AsNodeFactory()
	args := make([]*shimast.Node, argCount)
	for i := range args {
		args[i] = factory.NewIdentifier("value")
	}
	callee := factory.NewIdentifier("signatureof")
	return factory.NewCallExpression(callee, nil, nil, factory.NewNodeList(args), 0)
}

// TestSourceWrittenArgSyntheticCalleeGuard is the signaturetransform analog of the
// f1aaece checker-panic fix: a synthetic (inline-substituted) callee has Pos<0, so
// sourceWrittenArg must return cleanly WITHOUT reaching GetSymbolAtLocation — a
// nil checker here would panic if the guard failed. It also covers the arg-count
// guard (a non-unary call is rejected before the callee is inspected).
func TestSourceWrittenArgSyntheticCalleeGuard(t *testing.T) {
	ec := shimprinter.NewEmitContext()

	// Unary call, synthetic callee: the Pos<0 guard must fire before the checker.
	unary := syntheticSignatureofCall(ec, 1)
	if arg, ok := sourceWrittenArg(nil, unary); ok || arg != nil {
		t.Fatalf("synthetic unary call: got (%v, %t), want (nil, false)", arg, ok)
	}

	// Arg-count guard: a non-unary call is rejected up front.
	binary := syntheticSignatureofCall(ec, 2)
	if arg, ok := sourceWrittenArg(nil, binary); ok || arg != nil {
		t.Fatalf("binary call: got (%v, %t), want (nil, false)", arg, ok)
	}
	zero := syntheticSignatureofCall(ec, 0)
	if arg, ok := sourceWrittenArg(nil, zero); ok || arg != nil {
		t.Fatalf("zero-arg call: got (%v, %t), want (nil, false)", arg, ok)
	}
}

// TestSourceWrittenArgUnlinkedParentGuard is the signaturetransform analog of the
// #240 `.as`-chain nil-deref (see nameoftransform.isNameofCall's writeup): a
// callee can carry a REAL parsed position — so the Pos<0 guard above does not
// fire — while its `Parent` link is unset, because the inline stage's
// substitution rebuilt the wrapping node over a changed child without
// re-linking it. This stage's visitor walks every call expression exactly like
// tokenfor's, so it reaches the same shape. Detach a parsed (real-position)
// callee's Parent to reproduce the unlinked-but-positioned node directly, and
// assert the guard returns cleanly with a nil checker — a real checker call
// here would panic.
func TestSourceWrittenArgUnlinkedParentGuard(t *testing.T) {
	sf := parseTS(t, "signatureof(Foo);\n")
	call := findCallByCallee(sf, "signatureof")
	if call == nil {
		t.Fatal("signatureof(Foo) call not found")
	}
	callee := call.AsCallExpression().Expression
	if callee.Pos() < 0 {
		t.Fatalf("test setup: expected a real parsed position, got %d", callee.Pos())
	}
	callee.Parent = nil

	if arg, ok := sourceWrittenArg(nil, call); ok || arg != nil {
		t.Fatalf("unlinked-parent callee: got (%v, %t), want (nil, false)", arg, ok)
	}
}

// TestSignatureofArgArtifacts covers the artifacts (inline-substituted) branch,
// which anchors purely on the recorded use and NEVER touches the checker:
//   - a node recorded as a `signatureof` use with a ValueArg -> that ValueArg.
//   - a node recorded under a different primitive name -> falls through.
//   - a node not recorded at all -> falls through.
//   - nil artifacts -> falls through.
//
// Every fall-through lands on sourceWrittenArg with a synthetic callee, which the
// guard resolves to (nil,false) without a checker — so a nil checker is safe.
func TestSignatureofArgArtifacts(t *testing.T) {
	ec := shimprinter.NewEmitContext()
	factory := ec.Factory.AsNodeFactory()

	node := syntheticSignatureofCall(ec, 1)
	valueArg := factory.NewIdentifier("Foo")

	artifacts := inlinetransform.NewArtifacts()
	artifacts.PrimitiveCalls[node] = inlinetransform.PrimitiveUse{Name: "signatureof", ValueArg: valueArg}
	if arg, ok := signatureofArg(nil, artifacts, node); !ok || arg != valueArg {
		t.Fatalf("recorded signatureof use: got (%v, %t), want (%v, true)", arg, ok, valueArg)
	}

	// Recorded under a different primitive name -> falls through (no match).
	mismatch := inlinetransform.NewArtifacts()
	mismatch.PrimitiveCalls[node] = inlinetransform.PrimitiveUse{Name: "tokenfor", ValueArg: valueArg}
	if arg, ok := signatureofArg(nil, mismatch, node); ok || arg != nil {
		t.Fatalf("name-mismatch use: got (%v, %t), want (nil, false)", arg, ok)
	}

	// A recorded entry for a DIFFERENT node -> this node falls through.
	other := inlinetransform.NewArtifacts()
	other.PrimitiveCalls[syntheticSignatureofCall(ec, 1)] = inlinetransform.PrimitiveUse{Name: "signatureof", ValueArg: valueArg}
	if arg, ok := signatureofArg(nil, other, node); ok || arg != nil {
		t.Fatalf("unrecorded node: got (%v, %t), want (nil, false)", arg, ok)
	}

	// Nil artifacts -> straight to sourceWrittenArg.
	if arg, ok := signatureofArg(nil, nil, node); ok || arg != nil {
		t.Fatalf("nil artifacts: got (%v, %t), want (nil, false)", arg, ok)
	}
}

// --- program-backed cases ---------------------------------------------------

// buildSigWorkspace lays out a two-package workspace: a `@scope/prims` package
// declaring `signatureof` (and `tokenfor`, `keep`), and a consumer `main.ts` whose
// body is supplied by the caller. It returns the loaded program and the app dir.
func buildSigWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	prims := filepath.Join(root, "packages", "prims")
	write(t, filepath.Join(prims, "package.json"), `{
  "name": "@scope/prims",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	write(t, filepath.Join(prims, "src", "index.ts"), `export declare function signatureof(value: unknown): unknown;
export declare function tokenfor<T>(): string;
export declare const keep: number;
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/prims", prims)
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

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func linkPackage(t *testing.T, appDir, name, target string) {
	t.Helper()
	link := filepath.Join(appDir, "node_modules", name)
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
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

// findCallByCallee returns the first call expression whose callee identifier text
// equals name.
func findCallByCallee(sf *shimast.SourceFile, name string) *shimast.Node {
	var found *shimast.Node
	var walk func(n *shimast.Node)
	walk = func(n *shimast.Node) {
		if n == nil || found != nil {
			return
		}
		if n.Kind == shimast.KindCallExpression {
			callee := n.AsCallExpression().Expression
			if callee.Kind == shimast.KindIdentifier && callee.Text() == name {
				found = n
				return
			}
		}
		n.ForEachChild(func(c *shimast.Node) bool {
			walk(c)
			return found != nil
		})
	}
	walk(sf.AsNode())
	return found
}

// TestSourceWrittenArgResolvesSymbol drives the program-backed anchoring: a
// source-written `signatureof(Foo)` resolves its callee to the `signatureof`
// symbol and returns the value argument; an aliased import (`signatureof as sig`)
// resolves through GetAliasedSymbol; a same-shape call to a DIFFERENT function
// (`tokenfor`-like `other(Foo)`) is rejected on the name mismatch.
func TestSourceWrittenArgResolvesSymbol(t *testing.T) {
	mainSrc := `import { signatureof as sig, keep } from '@scope/prims';
declare function other(value: unknown): unknown;
class Foo {}
export const a = sig(Foo);
export const b = other(Foo);
export const c = keep;
`
	prog, _ := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()
	sf := mainSourceFile(t, prog)

	// Aliased happy path: `sig(Foo)` resolves through the alias to signatureof.
	sigCall := findCallByCallee(sf, "sig")
	if sigCall == nil {
		t.Fatal("sig(Foo) call not found")
	}
	arg, ok := sourceWrittenArg(prog.Checker, sigCall)
	if !ok {
		t.Fatal("aliased signatureof call was not anchored")
	}
	if arg.Kind != shimast.KindIdentifier || arg.Text() != "Foo" {
		t.Fatalf("anchored arg = %v, want identifier Foo", arg)
	}

	// Name mismatch: `other(Foo)` resolves to a symbol named `other`, not
	// signatureof, so it is rejected.
	otherCall := findCallByCallee(sf, "other")
	if otherCall == nil {
		t.Fatal("other(Foo) call not found")
	}
	if a, ok := sourceWrittenArg(prog.Checker, otherCall); ok || a != nil {
		t.Fatalf("name-mismatch call: got (%v, %t), want (nil, false)", a, ok)
	}
}

// lowerMain runs the New transform over main.ts and returns the reprinted output
// plus any diagnostics raised.
func lowerMain(t *testing.T, prog *driver.Program, app string) (string, []signatures.Diagnostic) {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	var diags []signatures.Diagnostic
	transform := New(prog, ctx, nil, func(d signatures.Diagnostic) { diags = append(diags, d) })
	ec := shimprinter.NewEmitContext()
	sf := mainSourceFile(t, prog)
	out := transform(ec, sf)
	return reprintSF(ec, out), diags
}

// TestNewLowersDepSlotKinds drives the New transform end-to-end over source-written
// `signatureof(value)` calls spanning the dep-slot kinds the extractor derives: a
// constructor with an injectable interface param (tokenSlot), a factory value
// (factorySlot), and a no-dependency class (empty signature). Every primitive call
// is lowered to its `[[...]]` array, none survives, the import is elided, and no
// diagnostic is raised (the standalone signatureof path carries no service token,
// so it runs no dependency-hole check).
func TestNewLowersDepSlotKinds(t *testing.T) {
	mainSrc := `import { signatureof } from '@scope/prims';
interface IDep {}
class WithDep { constructor(dep: IDep) { void dep; } }
class NoDep {}
const factory = (dep: IDep) => new WithDep(dep);
export const s1 = signatureof(WithDep);
export const s2 = signatureof(factory);
export const s3 = signatureof(NoDep);
`
	prog, app := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerMain(t, prog, app)

	// The tokenless standalone path raises no diagnostics.
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics on the tokenless path: %+v", diags)
	}
	// No primitive CALL survives, and the import is elided.
	if strings.Contains(out, "signatureof(") {
		t.Errorf("a signatureof() call survived lowering:\n%s", out)
	}
	if strings.Contains(out, "signatureof") {
		t.Errorf("the signatureof import was not elided:\n%s", out)
	}
	// tokenSlot: WithDep's IDep constructor param derives a token referencing IDep.
	if !strings.Contains(out, "IDep") {
		t.Errorf("WithDep's IDep dependency slot is missing:\n%s", out)
	}
	// empty: a no-dependency class lowers to `[[]]`.
	if !strings.Contains(out, "[[]]") {
		t.Errorf("the no-dependency class NoDep should lower to an empty [[]] array:\n%s", out)
	}
	// factorySlot: the factory value derives a non-empty signature (its IDep param).
	if strings.Count(out, "IDep") < 2 {
		t.Errorf("the factory value should derive its IDep param slot too:\n%s", out)
	}
}

// TestNewUnderivableParamStillErrors keeps the pre-existing 990006 behavior on the
// signatureof path: a constructor param whose type has no derivable token (an
// anonymous object type) lowers to the `??unresolvable??` sentinel AND raises
// codeUnderivableToken — the value's own signature concern (the transform's own
// inability to lower), reported with or without a surrounding registration.
func TestNewUnderivableParamStillErrors(t *testing.T) {
	mainSrc := `import { signatureof } from '@scope/prims';
class Bad { constructor(dep: { readonly a: number }) { void dep; } }
export const s = signatureof(Bad);
`
	prog, app := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerMain(t, prog, app)
	if !strings.Contains(out, "??unresolvable??") {
		t.Errorf("an underivable param should lower to the ??unresolvable?? sentinel:\n%s", out)
	}
	found := false
	for _, d := range diags {
		if d.Code == "990006" && d.Category == signatures.Error {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a 990006 underivable-token error, got %+v", diags)
	}
}

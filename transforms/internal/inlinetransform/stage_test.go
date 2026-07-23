package inlinetransform

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

// buildWorkspace lays out the standard two-package member-sugar workspace with
// caller-supplied core barrel, impl body, consumer declare-module, and consumer
// main. The rhombus.inline entry is always the pilot member entry (IQuery /
// QueryInline / isService). It returns the loaded consumer program and app dir.
// Focused variants that need a different entry (free-function, no-witness) have
// their own setup.
func buildWorkspace(t *testing.T, coreIndex, inlineBody, sugarDTS, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "core")
	write(t, filepath.Join(core, "package.json"), `{
  "name": "@scope/core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "type": "@scope/core:IQuery", "impl": "QueryInline", "member": "isService" } ]
  }
}`)
	write(t, filepath.Join(core, "src", "index.ts"), coreIndex)
	write(t, filepath.Join(core, "src", "inline.ts"), inlineBody)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/core": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/core", core)
	write(t, filepath.Join(app, "sugar.d.ts"), sugarDTS)
	write(t, filepath.Join(app, "main.ts"), mainSrc)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "sugar.d.ts", "node_modules/@scope/core/src/index.ts"]
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

const pilotSugarDTS = `declare module '@scope/core' {
  interface IQuery {
    isService<T>(): boolean;
  }
}
export {};
`

// findMethodSignature returns the first method-signature node named name in sf.
func findMethodSignature(t *testing.T, sf *shimast.SourceFile, name string) *shimast.Node {
	t.Helper()
	var found *shimast.Node
	walk(sf.AsNode(), func(n *shimast.Node) bool {
		if n.Kind == shimast.KindMethodSignature {
			if id := n.Name(); id != nil && id.Text() == name {
				found = n
				return true
			}
		}
		return false
	})
	if found == nil {
		t.Fatalf("no method signature named %q", name)
	}
	return found
}

// TestStageRogueDuplicateFires is emit tripwire 1's POSITIVE case: a call binding
// to a same-member declaration that sits inside a `declare module '@scope/core'`
// block for the entry's package, carries the entry's TypeName, but is OUTSIDE the
// resolved entry's merged declaration set — the dist-skew (two physical copies)
// signature — must be flagged INLINE_ROGUE_DUPLICATE.
//
// Spec deviation: the spec calls for a full two-physical-copies program driven
// through Build. Producing two genuinely-distinct `@scope/core` module symbols
// (so an augmentation's decl is NOT merged into the resolved interface symbol)
// deterministically through the real module resolver is not reliably
// reproducible — TS merges same-named ambient/augmentation blocks, defeating the
// setup. isRogueDuplicate reads the candidate declaration purely structurally
// (enclosing interface name, declare-module provenance, merged-set membership)
// and never touches the checker, so a faithfully-shaped SideParsed declaration
// drives the exact production branch deterministically. This is that test.
func TestStageRogueDuplicateFires(t *testing.T) {
	// A second physical copy's declare-module re-declaration of the member.
	sf := parse(t, "/dup/copy2.ts", `declare module '@scope/core' {
  interface IQuery {
    isService<T>(): boolean;
  }
}
`)
	shimast.SetParentInChildrenUnset(sf.AsNode())
	decl := findMethodSignature(t, sf, "isService")

	// The resolved entry whose merged set does NOT contain this decl (skew).
	resolved := &Resolved{
		Member:    "isService",
		TypeName:  "IQuery",
		Module:    "@scope/core",
		MemberSet: map[*shimast.Node]bool{},
	}
	st := &fileState{resolvedList: []*Resolved{resolved}}

	if !st.isRogueDuplicate(decl, "isService") {
		t.Fatal("a declare-module member declaration outside the merged set was not flagged as a rogue duplicate")
	}
	// Positive control: once the same declaration IS in the merged set (a
	// legitimate augmentation sibling), it must NOT be flagged — this is the
	// §8f36a63 exclusion the negative test guards from the other side.
	resolved.MemberSet[decl] = true
	if st.isRogueDuplicate(decl, "isService") {
		t.Fatal("a merged declaration must never be flagged rogue")
	}
}

// TestStageHoistsEffectfulReceiverTemp drives the PRODUCTION hoist path
// (fileState.hoistTemps prepending a factory-built `var` statement), distinct
// from the substitute-level env hoist. The impl body reads `this` twice and the
// call's receiver is effectful (`makeProvider()`), so the stage binds it to a
// single-eval temp and must emit a module-level `var <temp>;` declaration.
func TestStageHoistsEffectfulReceiverTemp(t *testing.T) {
	coreIndex := `export interface IQuery {
  isService(token: string): boolean;
}
export declare function makeProvider(): IQuery;
`
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>()) && this.isService(tokenfor<T>());
  },
};
`
	mainSrc := `/// <reference path="./sugar.d.ts" />
import { makeProvider } from '@scope/core';
interface Foo { readonly brand: 'foo'; }
export const known = makeProvider().isService<Foo>();
`
	prog, app := buildWorkspace(t, coreIndex, inlineBody, pilotSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics: %+v", diags)
	}
	if !artifacts.Active {
		t.Fatal("artifacts not active — the two-`this` entry did not resolve")
	}

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	if !strings.HasPrefix(strings.TrimSpace(out), "var ") {
		t.Errorf("expected a hoisted `var <temp>;` declaration at the top of the file, got:\n%s", out)
	}
	if n := strings.Count(out, "makeProvider()"); n != 1 {
		t.Errorf("effectful receiver makeProvider() must be evaluated exactly once, found %d:\n%s", n, out)
	}
	// The reprint must be valid TypeScript again.
	parse(t, "/hoist-out.ts", out)
}

// TestStageUnrecoverableTypeArgIsHardError: a matched sugar call whose type
// argument cannot be recovered (`provider.isService()` binds T to unknown) must
// fail loud with INLINE_INFERRED_TYPE_ARGUMENT and be left un-inlined, not ship a
// tokenless call. The sibling explicit call still inlines.
func TestStageUnrecoverableTypeArgIsHardError(t *testing.T) {
	coreIndex := `export interface IQuery {
  isService(token: string): boolean;
}
export declare const provider: IQuery;
`
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>());
  },
};
`
	mainSrc := `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
interface Foo { readonly brand: 'foo'; }
export const known = provider.isService<Foo>();
export const bad = provider.isService();
`
	prog, app := buildWorkspace(t, coreIndex, inlineBody, pilotSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	// Build resolves without error (the error is per-call-site, raised in the
	// transform), so drive the transform to surface it.
	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	inferred := 0
	for _, d := range diags {
		if d.Code == "INLINE_INFERRED_TYPE_ARGUMENT" {
			inferred++
			if !strings.Contains(d.Message, "type argument") {
				t.Errorf("INLINE_INFERRED_TYPE_ARGUMENT message should tell the author to write the type argument explicitly, got %q", d.Message)
			}
		}
	}
	if inferred != 1 {
		t.Fatalf("expected exactly 1 INLINE_INFERRED_TYPE_ARGUMENT, got %d: %+v", inferred, diags)
	}
	// The unrecoverable call is left untouched in the output.
	if !strings.Contains(out, "provider.isService()") {
		t.Errorf("the unrecoverable call should be left un-inlined, got:\n%s", out)
	}
}

// TestBodyWithConcreteNameofTypeArg PINS the current emergent behavior for an
// impl body that calls a primitive over a CONCRETE type (`tokenfor<Marker>()`)
// rather than the impl's own type parameter (gap 19). Today: the body passes the
// Go extract (checkFreeIdentifiers does not descend into primitive type-args), it
// is inlined, the synthetic `tokenfor<Marker>()` registers with ZERO bound type
// args (Marker is not in the impl's type-param env), the tokenfor stage cannot
// lower a zero-arg registration, so it survives — and the emit sweep hard-fails
// it as INLINE_UNLOWERED_PRIMITIVE. This is a late, confusing failure for a
// plausibly-legitimate authoring choice; the behavior is characterized here and
// FLAGGED FOR AN OWNER DESIGN DECISION (lower the concrete token, or reject early
// at extract/lint). This test locks the status quo until that decision lands.
func TestBodyWithConcreteNameofTypeArg(t *testing.T) {
	coreIndex := `export interface IQuery {
  isService(token: string): boolean;
}
export interface Marker { readonly m: 'marker'; }
export declare const provider: IQuery;
`
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives';
import type { IQuery, Marker } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<Marker>());
  },
};
`
	mainSrc := `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
interface Foo { readonly brand: 'foo'; }
export const known = provider.isService<Foo>();
`
	prog, app := buildWorkspace(t, coreIndex, inlineBody, pilotSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics (the concrete-tokenfor body currently passes extract): %+v", diags)
	}
	if !artifacts.Active {
		t.Fatal("artifacts not active — the concrete-tokenfor entry did not resolve/inline")
	}

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	result := transform(ec, main)

	// The concrete-type primitive survives the inline stage unlowered.
	out := reprint(ec, result)
	if !strings.Contains(out, "tokenfor<Marker>") {
		t.Fatalf("expected the concrete-type tokenfor<Marker>() to survive the inline stage, got:\n%s", out)
	}

	// The sweep is the backstop that turns the silent survival into a hard error.
	shimast.SetParentInChildrenUnset(result.AsNode())
	swept := Sweep(result, artifacts)
	found := false
	for _, d := range swept {
		if d.Code == "INLINE_UNLOWERED_PRIMITIVE" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected the emit sweep to flag the surviving concrete-type primitive with INLINE_UNLOWERED_PRIMITIVE, got %+v", swept)
	}
}

// setupFreeFunctionInlineWorkspace lays out an impl-only free-function inline: a
// `@scope/prims` package exporting `identity<T>(value)` (the inlineable body) and
// a second `keep` export, plus a consumer that imports BOTH from the one module
// and calls `identity<number>(1)`. It exercises the identifier-callee inline path
// and split-import elision (identity dropped, keep kept).
func setupFreeFunctionInlineWorkspace(t *testing.T) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	prims := filepath.Join(root, "packages", "prims")
	write(t, filepath.Join(prims, "package.json"), `{
  "name": "@scope/prims",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": { "entries": [ { "impl": "identity" } ] }
}`)
	write(t, filepath.Join(prims, "src", "index.ts"), `export function identity<T>(value: T): T {
  return value;
}
export declare const keep: number;
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/prims", prims)
	write(t, filepath.Join(app, "main.ts"), `import { identity, keep } from '@scope/prims';
export const x = identity<number>(1);
export const y = keep;
`)
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

// TestStageInlinesFreeFunction drives a free-function inline end-to-end through
// fileState.run: the identifier-callee pre-filter, the Receiver==nil branch of
// inlineCall, and the import-elision pass. The call is replaced by its
// substituted body, the now-unreferenced `identity` import is dropped while the
// still-used `keep` import survives (split-import), and the artifact records the
// declaring package.
func TestStageInlinesFreeFunction(t *testing.T) {
	prog, app := setupFreeFunctionInlineWorkspace(t)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics: %+v", diags)
	}
	if !artifacts.Active {
		t.Fatal("artifacts not active — the free-function entry did not resolve")
	}

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	// The call identity<number>(1) is substituted to its body (the arg 1), so no
	// trace of `identity` — neither the call nor its now-elided import — remains.
	if strings.Contains(out, "identity") {
		t.Errorf("expected the free-function call and its import to be gone, but `identity` survives:\n%s", out)
	}
	if !strings.Contains(out, "export const x = 1") {
		t.Errorf("expected the call replaced by its substituted body (const x = 1), got:\n%s", out)
	}
	// The split import's still-used binding survives.
	if !strings.Contains(out, "keep") {
		t.Errorf("the still-used `keep` import must survive elision, got:\n%s", out)
	}
	if got := artifacts.SugarFunctions["identity"]; got != "@scope/prims" {
		t.Fatalf("SugarFunctions[identity] = %q, want @scope/prims", got)
	}
	parse(t, "/free-out.ts", out)
}

// linkPackage symlinks appDir/node_modules/<name> to target, mirroring the bun
// isolated linker's workspace layout the collector resolves through.
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

// setupWorkspace lays out a two-package workspace mirroring the pilot: a `core`
// package declaring the interface, its sugar augmentation, and the impl body
// (kept out of the barrel in src/inline.ts), plus an `app` consumer program that
// calls the sugar. It returns the app program and directory.
func setupWorkspace(t *testing.T) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "core")
	write(t, filepath.Join(core, "package.json"), `{
  "name": "@scope/core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "type": "@scope/core:IQuery", "impl": "QueryInline", "member": "isService" } ]
  }
}`)
	write(t, filepath.Join(core, "src", "index.ts"), `export interface IQuery {
  isService(token: string): boolean;
}
export declare const provider: IQuery;
`)
	// The impl body — authored over the tokenfor primitive, kept out of the barrel.
	write(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>());
  },
};
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/core": "workspace:*" }
}`)
	// Symlink-free dep resolution: app/node_modules/@scope/core -> the core dir,
	// mirroring what the bun linker produces. The collector resolves through it.
	linkPackage(t, app, "@scope/core", core)

	write(t, filepath.Join(app, "sugar.d.ts"), `declare module '@scope/core' {
  interface IQuery {
    isService<T>(): boolean;
  }
}
export {};
`)
	write(t, filepath.Join(app, "main.ts"), `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
interface Foo { readonly brand: 'foo'; }
export const known = provider.isService<Foo>();
export const literal = provider.isService('x');
`)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "sugar.d.ts", "node_modules/@scope/core/src/index.ts"]
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

// TestStageInlinesMemberSugar drives the whole stage over the workspace: collect
// the publish list, resolve the entry, substitute the body at the explicit call,
// and register the synthetic tokenfor call. It asserts the sugar call is gone, the
// primitive form remains, exactly one primitive was registered, and the
// primitive-form (non-sugar) call passed through untouched.
func TestStageInlinesMemberSugar(t *testing.T) {
	prog, app := setupWorkspace(t)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics: %+v", diags)
	}
	if !artifacts.Active {
		t.Fatal("artifacts not active — the entry did not resolve")
	}

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	if strings.Contains(out, "isService<") {
		t.Errorf("sugar form isService<> survived:\n%s", out)
	}
	if !strings.Contains(out, "provider.isService(") {
		t.Errorf("expected substituted primitive call provider.isService(...):\n%s", out)
	}
	// The primitive-form call provider.isService('x') must pass through verbatim.
	if !strings.Contains(out, `provider.isService('x')`) && !strings.Contains(out, `provider.isService("x")`) {
		t.Errorf("primitive-form call was altered:\n%s", out)
	}
	if len(artifacts.PrimitiveCalls) != 1 {
		t.Fatalf("expected exactly 1 registered primitive call, got %d", len(artifacts.PrimitiveCalls))
	}
	for _, use := range artifacts.PrimitiveCalls {
		if use.Name != "tokenfor" || len(use.TypeArgs) != 1 {
			t.Fatalf("registered primitive = %+v, want tokenfor with 1 type arg", use)
		}
		if typeName(prog.Checker, use.TypeArgs[0]) != "Foo" {
			t.Fatalf("registered primitive type arg = %q, want Foo", typeName(prog.Checker, use.TypeArgs[0]))
		}
	}
	if artifacts.SugarMembers["isService"].TypeArgCount != 1 {
		t.Fatalf("sugar member shape not recorded: %+v", artifacts.SugarMembers)
	}
}

// setupDeclareModuleOverloadWorkspace lays out the repo's standard OPEN-receiver
// shape: the interface is EMPTY in the core barrel and both its sugar overload
// (`isService<T>()`) AND its non-sugar primitive overload (`isService(token)`)
// are contributed by a consumer `declare module` augmentation. A primitive-form
// call then binds to a declaration that sits inside a declare-module block for
// the entry's package and shares its TypeName — the exact provenance the
// rogue-duplicate heuristic keys on, but a legitimate merged sibling, not a
// dist-skew copy.
func setupDeclareModuleOverloadWorkspace(t *testing.T) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "core")
	write(t, filepath.Join(core, "package.json"), `{
  "name": "@scope/core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "type": "@scope/core:IQuery", "impl": "QueryInline", "member": "isService" } ]
  }
}`)
	// The interface is empty here — every isService overload arrives through the
	// consumer's declare-module augmentation below.
	write(t, filepath.Join(core, "src", "index.ts"), `export interface IQuery {}
export declare const provider: IQuery;
`)
	write(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>());
  },
};
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/core": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/core", core)

	// Both overloads live in the declare-module augmentation — the non-sugar
	// `isService(token: string)` is the OPEN-receiver primitive whose call must
	// NOT be flagged as a rogue duplicate.
	write(t, filepath.Join(app, "sugar.d.ts"), `declare module '@scope/core' {
  interface IQuery {
    isService(token: string): boolean;
    isService<T>(): boolean;
  }
}
export {};
`)
	write(t, filepath.Join(app, "main.ts"), `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
interface Foo { readonly brand: 'foo'; }
export const known = provider.isService<Foo>();
export const literal = provider.isService('x');
`)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "sugar.d.ts", "node_modules/@scope/core/src/index.ts"]
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

// TestStageDeclareModuleOverloadIsNotRogue guards the false-positive: a non-sugar
// overload declared in a `declare module` augmentation (the standard
// OPEN-receiver pattern) is a legitimate merged sibling, so a primitive-form call
// binding to it must pass through WITHOUT an INLINE_ROGUE_DUPLICATE diagnostic —
// even though it sits in a declare-module block for the entry's package and
// carries the entry's TypeName, the surface the rogue heuristic keys on.
func TestStageDeclareModuleOverloadIsNotRogue(t *testing.T) {
	prog, app := setupDeclareModuleOverloadWorkspace(t)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics: %+v", diags)
	}
	if !artifacts.Active {
		t.Fatal("artifacts not active — the entry did not resolve")
	}

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	for _, d := range diags {
		if d.Code == "INLINE_ROGUE_DUPLICATE" {
			t.Fatalf("legitimate declare-module overload flagged as a rogue duplicate: %+v", d)
		}
	}
	// The sugar call is still inlined; the primitive-form call passes through.
	if strings.Contains(out, "isService<") {
		t.Errorf("sugar form isService<> survived:\n%s", out)
	}
	if !strings.Contains(out, `provider.isService('x')`) && !strings.Contains(out, `provider.isService("x")`) {
		t.Errorf("primitive-form call was altered:\n%s", out)
	}
}

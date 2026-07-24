package inlinetransform

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// pilotMemberEntry is the standard IQuery/QueryInline/isService member entry a
// buildWorkspace workspace declares, owned by its core package.
func pilotMemberEntry(app string) OwnedEntry {
	core := filepath.Join(filepath.Dir(app), "core")
	return OwnedEntry{
		Entry:      Entry{Type: "@scope/core:IQuery", Impl: "QueryInline", Member: "isService"},
		PackageDir: core,
	}
}

const pilotCoreIndex = `export interface IQuery {
  isService(token: string): boolean;
}
export declare const provider: IQuery;
`

const pilotInlineBody = `import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>());
  },
};
`

// TestResolveMemberInertNoWitness: the entry's module is never witnessed by the
// program (main.ts neither imports @scope/core nor carries the declare-module),
// so resolution is inert — skip silently, never an error.
func TestResolveMemberInertNoWitness(t *testing.T) {
	prog, app := buildWorkspace(t, pilotCoreIndex, pilotInlineBody, `export {};
`, `export const x = 1;
`)
	defer func() { _ = prog.Close() }()

	_, inert, err := Resolve(prog, prog.Checker, newBodyExtractor(), pilotMemberEntry(app))
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !inert {
		t.Fatal("expected inert — @scope/core is not witnessed by the program")
	}
}

// TestResolveMemberInertNoSugarOverload: the module IS witnessed but the sugar
// overload (`isService<T>()`) is not loaded — only the primitive `isService(token)`
// exists — so the member symbol resolves yet no declaration matches the impl
// discriminator. That is inert (declMap empty), never an error, and Build over
// the workspace leaves artifacts inactive.
func TestResolveMemberInertNoSugarOverload(t *testing.T) {
	mainSrc := `import { provider } from '@scope/core';
export const y = provider.isService('x');
`
	prog, app := buildWorkspace(t, pilotCoreIndex, pilotInlineBody, `export {};
`, mainSrc)
	defer func() { _ = prog.Close() }()

	_, inert, err := Resolve(prog, prog.Checker, newBodyExtractor(), pilotMemberEntry(app))
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !inert {
		t.Fatal("expected inert — the sugar overload is not present, only the primitive")
	}

	// Build must reflect the same: no entry resolves active → inactive artifacts.
	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics: %+v", diags)
	}
	if artifacts.Active {
		t.Fatal("artifacts.Active should be false when every entry is inert")
	}
}

// TestResolveUnresolvedTypeAndMember: the two loud-failure guarantees. A type
// token naming a member the module does not export → INLINE_UNRESOLVED_TYPE; an
// interface member the type does not carry (but the impl does, so Extract passes)
// → INLINE_UNRESOLVED_MEMBER. Both are hard errors, never inert.
func TestResolveUnresolvedTypeAndMember(t *testing.T) {
	// The impl carries BOTH isService and a `missing` member, so Extract of the
	// `missing` member succeeds and resolution reaches the interface-member check.
	inlineBody := `import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>());
  },
  missing<T>(this: IQuery): boolean {
    return this.isService(tokenfor<T>());
  },
};
`
	mainSrc := `/// <reference path="./sugar.d.ts" />
import { provider } from '@scope/core';
interface Foo { readonly brand: 'foo'; }
export const known = provider.isService<Foo>();
`
	prog, app := buildWorkspace(t, pilotCoreIndex, inlineBody, pilotSugarDTS, mainSrc)
	defer func() { _ = prog.Close() }()

	core := filepath.Join(filepath.Dir(app), "core")

	t.Run("unresolved type", func(t *testing.T) {
		e := OwnedEntry{Entry: Entry{Type: "@scope/core:Missing", Impl: "QueryInline", Member: "isService"}, PackageDir: core}
		_, inert, err := Resolve(prog, prog.Checker, newBodyExtractor(), e)
		if inert {
			t.Fatal("a misspelled type must be a hard error, not inert")
		}
		if err == nil || !strings.Contains(err.Error(), "INLINE_UNRESOLVED_TYPE") {
			t.Fatalf("want INLINE_UNRESOLVED_TYPE, got %v", err)
		}
	})

	t.Run("unresolved member", func(t *testing.T) {
		e := OwnedEntry{Entry: Entry{Type: "@scope/core:IQuery", Impl: "QueryInline", Member: "missing"}, PackageDir: core}
		_, inert, err := Resolve(prog, prog.Checker, newBodyExtractor(), e)
		if inert {
			t.Fatal("a member absent from the interface must be a hard error, not inert")
		}
		if err == nil || !strings.Contains(err.Error(), "INLINE_UNRESOLVED_MEMBER") {
			t.Fatalf("want INLINE_UNRESOLVED_MEMBER, got %v", err)
		}
	})
}

// setupOverloadedFunctionWorkspace lays out an impl-only free-function whose
// export is OVERLOADED (a signature declaration plus its implementation).
func setupOverloadedFunctionWorkspace(t *testing.T) (*driver.Program, string) {
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
	write(t, filepath.Join(prims, "src", "index.ts"), `export function identity<T>(value: T): T;
export function identity<T>(value: T): T {
  return value;
}
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/prims", prims)
	write(t, filepath.Join(app, "main.ts"), `import { identity } from '@scope/prims';
export const x = identity<number>(1);
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

// TestResolveFreeFunctionOverloadedRejected: an overloaded free function is not
// certified. The rejection surfaces as INLINE_BODY_SHAPE, because Extract runs
// first and the first-found declaration is the bodyless overload signature — the
// fnDecls!=1 (INLINE_ENTRY_SHAPE) guard in resolveFunction sits behind it as
// defense in depth. This pins the reachable behavior.
//
// Spec deviation: the gap named the fnDecls!=1 / INLINE_ENTRY_SHAPE branch; that
// branch is shadowed by Extract's bodyless-signature check for any well-formed TS
// overload, so the reachable, asserted code is INLINE_BODY_SHAPE.
func TestResolveFreeFunctionOverloadedRejected(t *testing.T) {
	prog, app := setupOverloadedFunctionWorkspace(t)
	defer func() { _ = prog.Close() }()

	e := collectFreeFunction(t, app)
	_, inert, err := Resolve(prog, prog.Checker, newBodyExtractor(), e)
	if inert {
		t.Fatal("an overloaded free function must be a hard error, not inert")
	}
	if err == nil || !strings.Contains(err.Error(), "INLINE_BODY_SHAPE") {
		t.Fatalf("want INLINE_BODY_SHAPE (Extract sees the bodyless overload signature first), got %v", err)
	}
}

// setupFunctionWorkspace lays out a two-package workspace for the impl-only
// free-function grammar row: a scoped-name `@scope/prims` package that exports a
// function and declares it inlineable with an `{ "impl": "identity" }` entry (no
// type — no type-side anchor exists), plus an `app` consumer that imports and
// calls it (the witness). importsPrims toggles whether the app imports the
// package, exercising the witness/inert branch.
func setupFunctionWorkspace(t *testing.T, importsPrims bool) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	prims := filepath.Join(root, "packages", "prims")
	write(t, filepath.Join(prims, "package.json"), `{
  "name": "@scope/prims",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "impl": "identity" } ]
  }
}`)
	write(t, filepath.Join(prims, "src", "index.ts"), `export function identity<T>(value: T): T {
  return value;
}
`)

	app := filepath.Join(root, "packages", "app")
	write(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@scope/prims": "workspace:*" }
}`)
	linkPackage(t, app, "@scope/prims", prims)

	var mainSrc, files string
	if importsPrims {
		mainSrc = `import { identity } from '@scope/prims';
export const x = identity<number>(1);
`
		files = `["main.ts", "node_modules/@scope/prims/src/index.ts"]`
	} else {
		// No import of @scope/prims: nothing anchors its module specifier, so the
		// witness rule makes the entry inert.
		mainSrc = `export const x = 1;
`
		files = `["main.ts"]`
	}
	write(t, filepath.Join(app, "main.ts"), mainSrc)
	write(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": `+files+`
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

func collectFreeFunction(t *testing.T, app string) OwnedEntry {
	t.Helper()
	owned, err := Collect(app)
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	for _, oe := range owned {
		if oe.Entry.Impl == "identity" && oe.Entry.Type == "" && oe.Entry.Member == "" {
			return oe
		}
	}
	t.Fatalf("free-function entry not collected: %+v", owned)
	return OwnedEntry{}
}

// TestResolveFreeFunctionAgainstOwningPackage round-trips an impl-only entry
// through resolution: the module specifier comes from the OWNING package's own
// (scoped) name, not from a type token, and the entry resolves active.
func TestResolveFreeFunctionAgainstOwningPackage(t *testing.T) {
	prog, app := setupFunctionWorkspace(t, true)
	defer func() { _ = prog.Close() }()

	fnEntry := collectFreeFunction(t, app)
	resolved, inert, rerr := Resolve(prog, prog.Checker, newBodyExtractor(), fnEntry)
	if rerr != nil {
		t.Fatalf("Resolve: %v", rerr)
	}
	if inert {
		t.Fatal("free-function entry resolved inert — the owning package name did not anchor a witness")
	}
	if resolved.Kind != KindFunction {
		t.Fatalf("Kind = %v, want KindFunction", resolved.Kind)
	}
	if resolved.Module != "@scope/prims" {
		t.Fatalf("Module = %q, want @scope/prims (the owning package name)", resolved.Module)
	}
	if resolved.Member != "identity" {
		t.Fatalf("Member = %q, want identity", resolved.Member)
	}
}

// TestResolveFreeFunctionInert asserts the witness rule for the impl-only row:
// when the owning package's module is not touched by the program, the entry is
// inert (skip silently), never an error.
func TestResolveFreeFunctionInert(t *testing.T) {
	prog, app := setupFunctionWorkspace(t, false)
	defer func() { _ = prog.Close() }()

	fnEntry := collectFreeFunction(t, app)
	resolved, inert, rerr := Resolve(prog, prog.Checker, newBodyExtractor(), fnEntry)
	if rerr != nil {
		t.Fatalf("Resolve: %v", rerr)
	}
	if !inert {
		t.Fatalf("expected inert (no witness for @scope/prims), got resolved=%+v", resolved)
	}
}

// TestResolveRejectsUncertifiedKinds asserts Resolve raises the distinct
// INLINE_KIND_UNCERTIFIED error (not the malformed-shape error) for the two
// specced-but-not-certified rows, defending in depth behind the loader.
func TestResolveRejectsUncertifiedKinds(t *testing.T) {
	prog, app := setupFunctionWorkspace(t, true)
	defer func() { _ = prog.Close() }()

	cases := map[string]Entry{
		"class member":          {Type: "@scope/prims:Foo", Member: "bar"},
		"object-literal member": {Impl: "FooLiteral", Member: "bar"},
	}
	for name, e := range cases {
		t.Run(name, func(t *testing.T) {
			_, _, rerr := Resolve(prog, prog.Checker, newBodyExtractor(), OwnedEntry{Entry: e, PackageDir: app})
			if rerr == nil {
				t.Fatal("expected INLINE_KIND_UNCERTIFIED error")
			}
			if !strings.Contains(rerr.Error(), "INLINE_KIND_UNCERTIFIED") {
				t.Fatalf("want INLINE_KIND_UNCERTIFIED, got %v", rerr)
			}
		})
	}
}

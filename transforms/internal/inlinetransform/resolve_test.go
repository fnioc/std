package inlinetransform

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/samchon/ttsc/packages/ttsc/driver"
)

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

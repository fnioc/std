package inlinetransform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
)

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
	// The impl body — authored over the nameof primitive, kept out of the barrel.
	write(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(nameof<T>());
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
// and register the synthetic nameof call. It asserts the sugar call is gone, the
// primitive form remains, exactly one primitive was registered, and the
// primitive-form (non-sugar) call passed through untouched.
func TestStageInlinesMemberSugar(t *testing.T) {
	prog, app := setupWorkspace(t)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, app, artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
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
		if use.Name != "nameof" || len(use.TypeArgs) != 1 {
			t.Fatalf("registered primitive = %+v, want nameof with 1 type arg", use)
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
	write(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import type { IQuery } from './index';
export const QueryInline = {
  isService<T>(this: IQuery): boolean {
    return this.isService(nameof<T>());
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
	transform := Build(prog, app, artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
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

package inlinetransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// setupKeyedFenceWorkspace lays out an inline-active `add`-sugar workspace — the
// real ServiceManifestInline shape — whose consumer registers one PLAIN
// `add<IFoo>(Foo)` and one KEYED `add<Keyed<ICache, "redis">>(RedisCache)`. It is
// the fixture for the Keyed fence: the plain call inlines, the keyed call must be
// left un-inlined for the di direct stage (which composes the `#redis` suffix).
func setupKeyedFenceWorkspace(t *testing.T) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "core")
	write(t, filepath.Join(core, "package.json"), `{
  "name": "@scope/core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "type": "@scope/core:IServiceManifestBase", "impl": "ManifestInline", "member": "add" } ]
  }
}`)
	write(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  add(token: string, ctor: unknown, sig?: unknown): unknown;
}
export declare const services: IServiceManifestBase;
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
`)
	// The impl body — the real add-sugar shape, authored over the two primitives,
	// each imported from its home module (nameof from primitives, signatureof from
	// di.transformer).
	write(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import { signatureof } from '@rhombus-std/di.transformer';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  add<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.add(nameof<T>(), ctor, signatureof(ctor));
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

	write(t, filepath.Join(app, "sugar.d.ts"), `declare module '@scope/core' {
  interface IServiceManifestBase {
    add<T>(ctor: unknown): unknown;
  }
}
export {};
`)
	write(t, filepath.Join(app, "main.ts"), `/// <reference path="./sugar.d.ts" />
import { services } from '@scope/core';
import type { Keyed } from '@scope/core';
interface IFoo {}
interface ICache {}
class Foo implements IFoo {}
class RedisCache implements ICache {}
export const a = services.add<IFoo>(Foo);
export const b = services.add<Keyed<ICache, "redis">>(RedisCache);
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

// TestStageFencesKeyedRegistration is the Keyed fence: `add<Keyed<T, K>>(Impl)`
// must NOT be inlined. The inline path lowers its service token through nameof,
// which does not compose the `#key` suffix (only the di direct stage's
// KeyedTokenFor does) — so inlining a keyed registration would silently register
// under a key-less token. The fence leaves the keyed call verbatim for the di
// direct stage, while the sibling plain `add<IFoo>(Foo)` still inlines.
func TestStageFencesKeyedRegistration(t *testing.T) {
	prog, app := setupKeyedFenceWorkspace(t)
	defer func() { _ = prog.Close() }()

	artifacts := NewArtifacts()
	var diags []plugin.Diagnostic
	transform := Build(prog, bodiesFor(t, app), artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if len(diags) != 0 {
		t.Fatalf("Build raised diagnostics: %+v", diags)
	}
	if !artifacts.Active {
		t.Fatal("artifacts not active — the add entry did not resolve")
	}

	ec := shimprinter.NewEmitContext()
	main := sourceFileWithSuffix(t, prog, "main.ts")
	out := reprint(ec, transform(ec, main))

	// The plain registration inlined: its sugar type-argument form is gone.
	if strings.Contains(out, "add<IFoo>") {
		t.Errorf("plain add<IFoo> should have inlined, but the sugar form survived:\n%s", out)
	}
	// The keyed registration was FENCED: its sugar form survives verbatim, left for
	// the di direct stage to lower with the key.
	if !strings.Contains(out, "add<Keyed") {
		t.Errorf("keyed add<Keyed<...>> should have been fenced (left un-inlined), but the sugar form is gone:\n%s", out)
	}

	// Only the plain registration registered primitives; the fenced keyed call
	// registered none. So no registered nameof primitive is keyed, and exactly one
	// nameof was registered (for IFoo).
	nameofCount := 0
	for _, use := range artifacts.PrimitiveCalls {
		if use.Name != "nameof" {
			continue
		}
		nameofCount++
		if len(use.TypeArgs) == 1 {
			if _, keyed := tokens.KeyLiteralFor(use.TypeArgs[0], prog.Checker); keyed {
				t.Errorf("a keyed type reached the nameof primitive registry — the fence leaked: %s", typeName(prog.Checker, use.TypeArgs[0]))
			}
		}
	}
	if nameofCount != 1 {
		t.Fatalf("expected exactly 1 registered nameof primitive (the plain add<IFoo>), got %d", nameofCount)
	}
}

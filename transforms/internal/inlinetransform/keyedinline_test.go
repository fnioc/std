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

// setupKeyedInlineWorkspace lays out an inline-active `add`-sugar workspace — the
// real ServiceManifestInline shape carrying the §98 trailing `keyof<T>()` — whose
// consumer registers one PLAIN `add<IFoo>(Foo)` and one KEYED
// `add<Keyed<ICache, "redis">>(RedisCache)`. It is the fixture for keyed inline
// lowering: both calls inline, the plain one ELIDES its trailing keyof argument
// (byte-parity with the pre-keyof form) while the keyed one KEEPS it for the keyof
// stage to lower to the key string.
func setupKeyedInlineWorkspace(t *testing.T) (*driver.Program, string) {
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
  add(token: string, ctor: unknown, sig?: unknown, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
`)
	// The impl body — the real add-sugar shape, authored over the three primitives,
	// each imported from its home module (nameof from primitives, signatureof +
	// keyof from di.transformer). The trailing keyof<T>() is the §98 key half.
	write(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import { signatureof, keyof } from '@rhombus-std/di.transformer';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  add<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.add(nameof<T>(), ctor, signatureof(ctor), keyof<T>());
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

// TestStageLowersKeyedRegistration is the §98 keyed inline lowering (retiring the
// #244 fence): `add<Keyed<T, K>>(Impl)` now INLINES like any other registration.
// The keyed call keeps its trailing `keyof<T>()` argument (registered for the keyof
// stage, which lowers it to the key string composed at runtime as `base#key`),
// while the sibling plain `add<IFoo>(Foo)` inlines and ELIDES its trailing keyof
// argument entirely — byte-identical to the pre-keyof 3-argument form.
func TestStageLowersKeyedRegistration(t *testing.T) {
	prog, app := setupKeyedInlineWorkspace(t)
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

	// Both registrations inlined: neither sugar type-argument form survives, and
	// both emit a nameof primitive (its bound type stays recorded in artifacts, so
	// the emitted type argument is the body's `T`, not the call-site type).
	if strings.Contains(out, "add<IFoo>") {
		t.Errorf("plain add<IFoo> should have inlined, but the sugar form survived:\n%s", out)
	}
	if strings.Contains(out, "add<Keyed") {
		t.Errorf("keyed add<Keyed<...>> should have inlined (fence retired), but the sugar form survived:\n%s", out)
	}
	if got := strings.Count(out, "nameof<"); got != 2 {
		t.Errorf("expected 2 inlined nameof calls (plain + keyed), got %d:\n%s", got, out)
	}
	// EXACTLY one keyof argument survives: the keyed call keeps it (the keyof stage
	// lowers it), the plain call ELIDED it — byte-parity with the pre-keyof form.
	if got := strings.Count(out, "keyof<"); got != 1 {
		t.Errorf("expected exactly 1 surviving keyof call (keyed kept, plain elided), got %d:\n%s", got, out)
	}

	// Both registrations registered a nameof primitive; only the keyed one registered
	// a keyof primitive (the plain one's was elided before registration).
	nameofCount, keyofCount := 0, 0
	for _, use := range artifacts.PrimitiveCalls {
		switch use.Name {
		case "nameof":
			nameofCount++
		case "keyof":
			keyofCount++
			if len(use.TypeArgs) == 1 {
				if _, keyed := tokens.KeyLiteralFor(use.TypeArgs[0], prog.Checker); !keyed {
					t.Errorf("the registered keyof primitive should be keyed: %s", typeName(prog.Checker, use.TypeArgs[0]))
				}
			}
		}
	}
	if nameofCount != 2 {
		t.Fatalf("expected 2 registered nameof primitives (plain + keyed), got %d", nameofCount)
	}
	if keyofCount != 1 {
		t.Fatalf("expected exactly 1 registered keyof primitive (the keyed add), got %d", keyofCount)
	}
}

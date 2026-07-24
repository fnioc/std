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

// setupKeyedInlineWorkspace lays out an inline-active `addClass`-sugar workspace — the
// real ServiceManifestInline shape carrying the §98 trailing `keyof<T>()` — whose
// consumer registers one PLAIN `addClass<IFoo>(Foo)` and one KEYED
// `addClass<Keyed<ICache, "redis">>(RedisCache)`. It is the fixture for keyed inline
// lowering: both calls inline, the plain one ELIDES its keyof argument AND the
// `void 0` scope placeholder that elision strands (byte-parity with the plain
// 3-argument form), while the keyed one KEEPS both for the keyof stage to lower.
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
    "entries": [ { "type": "@scope/core:IServiceManifestBase", "impl": "ManifestInline", "member": "addClass" } ]
  }
}`)
	write(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): unknown;
}
export declare const services: IServiceManifestBase;
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
`)
	// The impl body — the real add-sugar shape, authored over the three primitives,
	// each imported from its home module (tokenfor from primitives, signatureof +
	// keyof from di.extras). keyof<T>() is the §98 key half, sitting in the
	// KEY slot (argument 5) behind the `void 0` that fills the scope slot the
	// type-driven sugar has no value for.
	write(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives.extras';
import { signatureof, keyof } from '@rhombus-std/di.extras';
import type { IServiceManifestBase } from './index';
export const ManifestInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): unknown {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>());
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
    addClass<T>(ctor: unknown): unknown;
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
export const a = services.addClass<IFoo>(Foo);
export const b = services.addClass<Keyed<ICache, "redis">>(RedisCache);
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
// #244 fence): `addClass<Keyed<T, K>>(Impl)` now INLINES like any other registration.
// The keyed call keeps its `keyof<T>()` argument in the KEY slot (registered for
// the keyof stage, which lowers it to the key string composed at runtime as
// `base#key`), while the sibling plain `addClass<IFoo>(Foo)` inlines and ELIDES that
// argument along with the `void 0` scope placeholder ahead of it — byte-identical
// to the plain 3-argument registration form.
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
	// both emit a tokenfor primitive (its bound type stays recorded in artifacts, so
	// the emitted type argument is the body's `T`, not the call-site type).
	if strings.Contains(out, "addClass<IFoo>") {
		t.Errorf("plain addClass<IFoo> should have inlined, but the sugar form survived:\n%s", out)
	}
	if strings.Contains(out, "addClass<Keyed") {
		t.Errorf("keyed addClass<Keyed<...>> should have inlined (fence retired), but the sugar form survived:\n%s", out)
	}
	if got := strings.Count(out, "tokenfor<"); got != 2 {
		t.Errorf("expected 2 inlined tokenfor calls (plain + keyed), got %d:\n%s", got, out)
	}
	// EXACTLY one keyof argument survives: the keyed call keeps it (the keyof stage
	// lowers it), the plain call ELIDED it — byte-parity with the pre-keyof form.
	if got := strings.Count(out, "keyof<"); got != 1 {
		t.Errorf("expected exactly 1 surviving keyof call (keyed kept, plain elided), got %d:\n%s", got, out)
	}
	// The scope placeholder shares the key's fate. The plain call dropped it with
	// its keyof (leaving the plain 3-argument form); the keyed call keeps it, and
	// keeps it AHEAD of the key — the slot order the runtime verb reads.
	if got := strings.Count(out, "void 0"); got != 1 {
		t.Errorf("expected exactly 1 surviving `void 0` scope placeholder (keyed only), got %d:\n%s", got, out)
	}
	if !strings.Contains(out, "void 0, keyof<") {
		t.Errorf("the keyed call must carry its key in the KEY slot, behind the scope placeholder:\n%s", out)
	}

	// Both registrations registered a tokenfor primitive; only the keyed one registered
	// a keyof primitive (the plain one's was elided before registration).
	nameofCount, keyofCount := 0, 0
	for _, use := range artifacts.PrimitiveCalls {
		switch use.Name {
		case "tokenfor":
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
		t.Fatalf("expected 2 registered tokenfor primitives (plain + keyed), got %d", nameofCount)
	}
	if keyofCount != 1 {
		t.Fatalf("expected exactly 1 registered keyof primitive (the keyed add), got %d", keyofCount)
	}
}

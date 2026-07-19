package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
)

// buildAsDecoupleWorkspace extends buildInlinePresetWorkspace's shape with an
// `AddBuilder<Scopes>` continuation carrying `.as(scope)` / the authored
// `.as<S>()` sugar — the #240 decouple's own shape (`add<I>(C).as<"scope">()`),
// which buildInlinePresetWorkspace's `unknown`-returning add stub can't express.
// A dedicated builder rather than extending the shared fixture: the sibling
// open-template test already depends on buildInlinePresetWorkspace's exact
// shape, and this workspace's `.as` surface is unique to this file's tests.
func buildAsDecoupleWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [ { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestInline", "member": "add" } ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface AddBuilder<Scopes extends string> {
  as(scope: Scopes): void;
}
export interface IServiceManifestBase {
  add(token: string, ctor: unknown, sig?: unknown): AddBuilder<'singleton'>;
}
export declare const services: IServiceManifestBase;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
`)
	// The real add-sugar body — see di.transformer's own src/inline.ts — now typed
	// to return AddBuilder (rather than buildInlinePresetWorkspace's bare unknown)
	// so the returned builder's `.as` chain type-checks against a real continuation.
	// signatureof is imported from its home (di.transformer), nameof from primitives.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import { signatureof } from '@rhombus-std/di.transformer';
import type { AddBuilder, IServiceManifestBase } from './index';
export const ManifestInline = {
  add<T>(this: IServiceManifestBase, ctor: unknown): AddBuilder<'singleton'> {
    return this.add(nameof<T>(), ctor, signatureof(ctor));
  },
};
`)

	app := filepath.Join(root, "packages", "app")
	writeFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/di.core": "workspace:*" }
}`)
	linkPkg(t, app, "@rhombus-std/di.core", core)

	// The standard consumer augmentation (mirroring di.transformer's real
	// declare-module) — both the `add<T>()` sugar overload AND the authored
	// `.as<S>()` type-arg form merge onto their respective di.core interfaces.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    add<T>(ctor: unknown): AddBuilder<'singleton'>;
  }
  interface AddBuilder<Scopes extends string> {
    as<S extends Scopes>(): void;
  }
}
export {};
`)
	writeFile(t, filepath.Join(app, "main.ts"), mainSrc)
	writeFile(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "sugar.d.ts", "node_modules/@rhombus-std/di.core/src/index.ts"]
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

// lowerAsDecoupleInlinePipeline runs the full bundle over main.ts — inline
// substitution, nameof token lowering, signatureof dependency-array lowering,
// THEN the di stage (which owns the trailing `.as<>` lowering) — sharing one
// artifacts bag exactly as the owner host composes them.
func lowerAsDecoupleInlinePipeline(t *testing.T, prog *driver.Program, app string) string {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	artifacts := inlinetransform.NewArtifacts()
	inlineBodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	inlineT := inlinetransform.Build(prog, inlineBodies, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	sigT := signaturetransform.New(prog, ctx, artifacts, func(ditransform.Diagnostic) {})
	diT := ditransform.New(prog, ctx, func(ditransform.Diagnostic) {})
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the add preset entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	return reprint(ec, diT(ec, sigT(ec, nameofT(ec, inlineT(ec, sf)))))
}

// TestAsDecoupleInlinePipelineLowersCleanly is the #240 `.as<>`-decouple's own
// dedicated fixture, deferred by that PR (its "e2e `.as` extension dropped"
// deviation note): a `.as<"singleton">()` chained directly onto an
// inline-substituted `add<I>(C)` call must lower to the value-arg `.as("singleton")`
// with no authored generic or primitive surviving, and it must not panic — the
// #240-noted nameof/checker nil-deref (`isNameofCall` -> `GetSymbolAtLocation`)
// reproduced ONLY in this exact shape: a chained call whose OBJECT expression was
// just replaced by the inline substitution keeps a real source position (so the
// existing `Pos() < 0` synthetic guard doesn't fire) but loses its `Parent` link
// (the factory's `Update...` rebuild of the wrapping property access never
// re-links it), and the checker's `GetSymbolAtLocation` derefs `Parent.Parent`
// unconditionally.
func TestAsDecoupleInlinePipelineLowersCleanly(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
class Foo implements IFoo {}
services.add<IFoo>(Foo).as<'singleton'>();
`
	prog, app := buildAsDecoupleWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerAsDecoupleInlinePipeline(t, prog, app)
	if !strings.Contains(out, `.as("singleton")`) {
		t.Fatalf("expected the trailing .as<> lowered to a value-arg call, got:\n%s", out)
	}
	if strings.Contains(out, "as<") {
		t.Fatalf("authored .as<> generic survived lowering:\n%s", out)
	}
	if strings.Contains(out, "add<") {
		t.Fatalf("authored add<> generic survived lowering:\n%s", out)
	}
	if strings.Contains(out, "nameof") || strings.Contains(out, "signatureof(") {
		t.Fatalf("an un-lowered primitive survived:\n%s", out)
	}
}

// TestAsDecoupleInlinePipelineMatchesDiDirect is the byte-parity half of the
// #240 decouple fixture: the SAME `add<I>(C).as<"scope">()` registration, lowered
// once through the inline pipeline and once through the di stage's direct
// (non-inline) recognition, must carry the same service token, dependency array,
// AND `.as` lowering — the decouple changes the PATH only, never the bytes. This
// is the transformer-byte coverage #240 deferred in favor of the app's
// expected.txt runtime gate; that gate stays authoritative for the real app, this
// pins the primitive-level contract the app's byte-identity relies on.
func TestAsDecoupleInlinePipelineMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
class Foo implements IFoo {}
services.add<IFoo>(Foo).as<'singleton'>();
`
	prog, app := buildAsDecoupleWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut := lowerAsDecoupleInlinePipeline(t, prog, app)
	diOut := lowerDi(t, prog, app)

	inlineTok := diServiceToken(t, inlineOut)
	diTok := diServiceToken(t, diOut)
	if inlineTok != diTok {
		t.Fatalf("service-token divergence:\n inline pipeline = %q\n di direct       = %q", inlineTok, diTok)
	}

	if !strings.Contains(inlineOut, `.as("singleton")`) {
		t.Fatalf("inline pipeline: .as<> did not lower to a value-arg call:\n%s", inlineOut)
	}
	if !strings.Contains(diOut, `.as("singleton")`) {
		t.Fatalf("di direct: .as<> did not lower to a value-arg call:\n%s", diOut)
	}
}

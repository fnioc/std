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
	"github.com/fnioc/std/transforms/internal/valueoftransform"
)

// buildAsDecoupleWorkspace extends buildInlinePresetWorkspace's shape with an
// `IAsBuilder<Scopes>` continuation carrying `.as(scope)` / the authored
// `.as<S>()` sugar — the #240 decouple's own shape (`addClass<I>(C).as<"scope">()`),
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
    "entries": [
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestInline", "member": "addClass" },
      { "type": "@rhombus-std/di.core:IAsBuilder", "impl": "ManifestInline", "member": "as" }
    ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IAsBuilder<Scopes extends string> {
  as(scope: Scopes): IAsBuilder<Scopes>;
}
export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): IAsBuilder<'singleton'>;
}
export declare const services: IServiceManifestBase;
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
export type $<N extends number> = Hole<N>;
declare const ARG: unique symbol;
export type Typeof<T> = { readonly [ARG]?: T };
`)
	// The real add-sugar body — see di.transformer's own src/inline.ts — now typed
	// to return IAsBuilder (rather than buildInlinePresetWorkspace's bare unknown)
	// so the returned builder's `.as` chain type-checks against a real continuation.
	// signatureof / valueof are imported from their home (di.transformer), nameof
	// from primitives. The `.as<Scope>()` body lowers via valueof — the #269 decouple
	// makes `.as` a plain inline body (`this.as(valueof<Scope>())`), not a di-stage form.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { nameof } from '@rhombus-std/primitives';
import { signatureof, valueof } from '@rhombus-std/di.transformer';
import type { IAsBuilder, IServiceManifestBase } from './index';
export const ManifestInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): IAsBuilder<'singleton'> {
    return this.addClass(nameof<T>(), ctor, signatureof(ctor));
  },
  as<Scope extends 'singleton'>(this: IAsBuilder<'singleton'>): IAsBuilder<'singleton'> {
    return this.as(valueof<Scope>());
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
	// declare-module) — both the `addClass<T>()` sugar overload AND the authored
	// `.as<S>()` type-arg form merge onto their respective di.core interfaces.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): IAsBuilder<'singleton'>;
  }
  interface IAsBuilder<Scopes extends string> {
    as<S extends Scopes>(): IAsBuilder<Scopes>;
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
// valueof scope-value lowering (which owns the trailing `.as<Scope>()` scope
// half), THEN the di stage — sharing one artifacts bag exactly as the owner host
// composes them. The di stage no longer touches `.as`: the inline body
// `this.as(valueof<Scope>())` plus the valueof stage lower it (#269 decouple).
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
	valueofT := valueoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	diT := ditransform.New(prog, ctx, func(ditransform.Diagnostic) {})
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the add preset entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	return reprint(ec, diT(ec, valueofT(ec, sigT(ec, nameofT(ec, inlineT(ec, sf))))))
}

// TestAsDecoupleInlinePipelineLowersCleanly is the #240 `.as<>`-decouple's own
// dedicated fixture, deferred by that PR (its "e2e `.as` extension dropped"
// deviation note): a `.as<"singleton">()` chained directly onto an
// inline-substituted `addClass<I>(C)` call must lower to the value-arg `.as("singleton")`
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
services.addClass<IFoo>(Foo).as<'singleton'>();
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
	if strings.Contains(out, "addClass<") {
		t.Fatalf("authored addClass<> generic survived lowering:\n%s", out)
	}
	if strings.Contains(out, "nameof") || strings.Contains(out, "signatureof(") || strings.Contains(out, "valueof") {
		t.Fatalf("an un-lowered primitive survived:\n%s", out)
	}
}

// TestAsDecoupleInlinePipelineMatchesDiDirect is the byte-parity half of the #269
// decouple fixture: the SAME `addClass<I>(C).as<"scope">()` registration, lowered
// once through the inline pipeline and once through the di stage's direct
// (non-inline) recognition, must carry the same service token AND the same `.as`
// lowering. `.as<Scope>()` keeps BOTH lowering paths (mirroring addClass): the
// inline path lowers it via its body + valueof, the di-direct path via the di
// stage's own recognizer (routed through the shared valueof literal extraction).
// Both must produce the hand-writable `.as("singleton")` — the decouple changed
// how the valueof extraction is SHARED, never the bytes.
func TestAsDecoupleInlinePipelineMatchesDiDirect(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).as<'singleton'>();
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

package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/valueoftransform"
)

// buildWithSigChainWorkspace stands up a di.core-as-source workspace whose
// registration chain carries the type-driven `withSignature<T>()` APPEND sugar
// AND the `.as<Scope>()` lifetime sugar, so the full inline pipeline lowers a
// realistic `addClass<I>(C).withSignature<[IDep]>().as<'scoped'>()` chain. The
// inline bodies (in di.core's out-of-barrel src/inline.ts) mirror the real
// ManifestChainInline: `withSignature<T>() => this.withSignature(...signaturefor<T>())`
// and `as<Scope>() => this.as(valueof<Scope>())`.
func buildWithSigChainWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
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
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ChainInline", "member": "addClass" },
      { "type": "@rhombus-std/di.core:IWithSignatureBuilder", "impl": "ChainInline", "member": "withSignature" },
      { "type": "@rhombus-std/di.core:IAsBuilder", "impl": "ChainInline", "member": "as" }
    ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IAsBuilder<Scopes extends string> {
  as(scope: Scopes): IAsBuilder<Scopes>;
}
export interface IWithSignatureBuilder {
  withSignature(...slots: readonly unknown[]): IChain;
}
export interface IChain extends IWithSignatureBuilder, IAsBuilder<'scoped'> {}
export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): IChain;
}
export declare const services: IServiceManifestBase;
export declare function signaturefor<T extends readonly any[]>(): readonly unknown[];
`)
	// The inline bodies, mirroring the real di.transformer ManifestChainInline:
	// addClass derives token + dep-array; withSignature mints ONE overload's slots
	// from the tuple and spreads them; as mints the scope literal value.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives.extras';
import { signatureof, valueof } from '@rhombus-std/di.transformer';
import { signaturefor } from '@rhombus-std/di.core';
import type { IAsBuilder, IChain, IServiceManifestBase, IWithSignatureBuilder } from './index';
export const ChainInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): IChain {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor));
  },
  withSignature<T extends readonly any[]>(this: IWithSignatureBuilder): IChain {
    return this.withSignature(...signaturefor<T>());
  },
  as<Scope extends 'scoped'>(this: IAsBuilder<'scoped'>): IAsBuilder<'scoped'> {
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

	// The consumer augmentation mirroring di.transformer's real declare-module: the
	// type-driven addClass<T>() / withSignature<T>() / as<S>() overloads merge onto
	// their respective di.core faces.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): IChain;
  }
  interface IWithSignatureBuilder {
    withSignature<T extends readonly any[]>(): IChain;
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

// TestWithSignatureAsChainLowersToHandWritable is the A3/A4 parity case: a
// `addClass<IFoo>(Foo).withSignature<[IDep]>().as<'scoped'>()` sugar CHAIN, run
// through the full inline pipeline, must lower to EXACTLY the form a no-transformer
// author would hand-write — the registration token + dep array, the appended
// overload's slot token spread positionally into `.withSignature("...IDep")`, and
// the scope literal in `.as("scoped")` — with no authoring generic, spread, or
// primitive surviving.
func TestWithSignatureAsChainLowersToHandWritable(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
interface IDep {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).withSignature<[IDep]>().as<'scoped'>();
`
	prog, app := buildWithSigChainWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out := lowerAsDecoupleInlinePipeline(t, prog, app)

	// The appended overload's slot is spread positionally into withSignature — a
	// bare token arg, NOT wrapped in a single-level array, and NOT a spread.
	if !strings.Contains(out, `.withSignature("@scope/app/main:IDep")`) {
		t.Fatalf("withSignature<[IDep]>() did not lower to the hand-writable append:\n%s", out)
	}
	// The lifetime sugar lowers to the value-arg form.
	if !strings.Contains(out, `.as("scoped")`) {
		t.Fatalf(".as<'scoped'>() did not lower to the value-arg call:\n%s", out)
	}
	// The registration itself lowered (token + dep array).
	if !strings.Contains(out, `.addClass("@scope/app/main:IFoo", Foo,`) {
		t.Fatalf("addClass<IFoo>(Foo) did not lower to the tokenized registration:\n%s", out)
	}
	// No authoring surface survives.
	for _, banned := range []string{"withSignature<", "as<", "addClass<", "signaturefor", "valueof", "tokenfor", "..."} {
		if strings.Contains(out, banned) {
			t.Fatalf("authoring surface %q survived the chain lowering:\n%s", banned, out)
		}
	}
}

// TestEmptyTupleWithSignatureDoesNotReMatchOwnOutput is the W2 regression pin for
// the synthetic-node re-match bug. `withSignature<[]>()` lowers to the zero-argument
// `.withSignature()` — the empty tuple makes `...signaturefor<[]>()` spread nothing —
// and on the NEXT loop pass the inline visitor sees that factory-built, position-less
// call and, absent the synthetic guard in tryInline, re-matches it against the
// `withSignature<T>()` sugar overload. RecoverTypeArguments then fails on the
// argument-less call, emitting a spurious INLINE_INFERRED_TYPE_ARGUMENT and failing
// the build despite a byte-correct emit. With the guard, the synthetic call is a
// clean non-match: no diagnostic, and the loop settles instead of spinning to the
// pass cap.
func TestEmptyTupleWithSignatureDoesNotReMatchOwnOutput(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).withSignature<[]>();
`
	prog, app := buildWithSigChainWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	artifacts := inlinetransform.NewArtifacts()
	ctx := plugin.NewContext(prog, app)
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}

	var inlineDiags []plugin.Diagnostic
	captureInline := func(d plugin.Diagnostic) { inlineDiags = append(inlineDiags, d) }

	loop := []plugin.FileTransform{
		inlinetransform.Build(prog, bodies, artifacts, captureInline),
		New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
		signaturetransform.New(prog, ctx, artifacts, func(signatures.Diagnostic) {}),
		keyoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
		valueoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
	}

	ec := shimprinter.NewEmitContext()
	settled, _, exhausted := plugin.RunToFixedPoint(ec, loop, mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatalf("empty-tuple chain did not settle within %d passes — the synthetic re-match spun the loop", loopMaxPasses)
	}
	for _, d := range inlineDiags {
		if d.Code == "INLINE_INFERRED_TYPE_ARGUMENT" {
			t.Fatalf("inline re-matched its own lowered zero-argument output and emitted a spurious %s: %s", d.Code, d.Message)
		}
	}

	shimast.SetParentInChildrenUnset(settled.AsNode())
	out := reprint(ec, settled)
	// The empty tuple lowers to a bare zero-argument withSignature call, and nothing
	// of the authoring surface (generic, spread, primitive) survives.
	if !strings.Contains(out, ".withSignature()") {
		t.Fatalf("withSignature<[]>() did not lower to the zero-argument call:\n%s", out)
	}
	for _, banned := range []string{"withSignature<", "signaturefor", "..."} {
		if strings.Contains(out, banned) {
			t.Fatalf("authoring surface %q survived the empty-tuple lowering:\n%s", banned, out)
		}
	}
}

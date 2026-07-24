package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/foldtransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/singulartransform"
	"github.com/fnioc/std/transforms/internal/valueoftransform"
)

// buildResolveInlineWorkspace lays out the RESOLVE-family inline workspace: a core
// package literally named `@rhombus-std/di.core` carrying the runtime resolve
// surface plus the `rhombus.inline` resolve / resolveAsync / tryResolve entries and
// the real `ResolverInline` body
// (`resolve<T>() => isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>())`),
// so the SAME tokenless resolve call can be lowered two ways — through the INLINE
// pipeline (inline -> tokenfor -> singular -> fold) and through the di DIRECT stage
// (lowerResolveCall). The declare-module sugar overloads arrive through the app's
// augmentation, exactly as a consumer wires them.
func buildResolveInlineWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
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
      { "type": "@rhombus-std/di.core:IRequiredResolver", "impl": "ResolverInline", "member": "resolve" },
      { "type": "@rhombus-std/di.core:IResolver", "impl": "ResolverInline", "member": "resolveAsync" },
      { "type": "@rhombus-std/di.core:IResolver", "impl": "ResolverInline", "member": "tryResolve" }
    ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IRequiredResolver {
  resolve<T>(token: string): T;
}
export interface IResolver extends IRequiredResolver {
  resolveAsync<T>(token: string): Promise<T>;
  tryResolve<T>(token: string): T | undefined;
}
export declare const provider: IResolver;
`)
	// The real ResolverInline body, authored over the compile-time primitives —
	// tokenfor from the runtime leaf, isSingular / singularValue from the token-grammar
	// transformer. Each verb calls ITSELF with the derived token; a SINGULAR T folds
	// to its value.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives';
import { isSingular, singularValue } from '@rhombus-std/primitives.transformer';
interface IInlineResolveTarget {
  resolve(token: string): any;
  resolveAsync(token: string): any;
  tryResolve(token: string): any;
}
export const ResolverInline = {
  resolve<T>(this: IInlineResolveTarget): T {
    return isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>());
  },
  resolveAsync<T>(this: IInlineResolveTarget): Promise<T> | T {
    return isSingular<T>() ? singularValue<T>() : this.resolveAsync(tokenfor<T>());
  },
  tryResolve<T>(this: IInlineResolveTarget): T | undefined {
    return isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenfor<T>());
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
	// The sugar overloads arrive through the standard consumer declare-module
	// augmentation — resolve on IRequiredResolver, resolveAsync/tryResolve on
	// IResolver — so `provider.resolve<T>()` anchors on the di.core member for BOTH
	// the inline matcher and the di direct stage.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IRequiredResolver {
    resolve<T>(): T;
    resolve<F extends (...args: any[]) => any>(): ReturnType<F>;
  }
  interface IResolver {
    resolveAsync<T>(): Promise<T>;
    tryResolve<T>(): T | undefined;
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

// lowerResolveInlinePipeline runs the full resolve-family inline pipeline over
// main.ts — inline substitution, then tokenfor / signatureof / keyof / valueof
// primitive lowering, then the singular predicate/value lowering, then the generic
// fold — sharing one artifacts bag exactly as the owner host composes them, and
// returns the reprinted output. It collects any diagnostic the pipeline emits so a
// caller can assert a loud lowering failure.
func lowerResolveInlinePipeline(t *testing.T, prog *driver.Program, app string) (string, []plugin.Diagnostic) {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	artifacts := inlinetransform.NewArtifacts()
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	var diags []plugin.Diagnostic
	sink := func(d plugin.Diagnostic) { diags = append(diags, d) }
	inlineT := inlinetransform.Build(prog, bodies, artifacts, sink)
	nameofT := New(prog, ctx, artifacts, sink)
	sigT := signaturetransform.New(prog, ctx, artifacts, func(ditransform.Diagnostic) {})
	keyofT := keyoftransform.New(prog, ctx, artifacts, sink)
	valueofT := valueoftransform.New(prog, ctx, artifacts, sink)
	singularT := singulartransform.New(prog, ctx, artifacts, sink)
	foldT := foldtransform.New(prog, sink)
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the resolve entries did not resolve")
	}
	stages := []plugin.FileTransform{inlineT, nameofT, sigT, keyofT, valueofT, singularT, foldT}
	ec := shimprinter.NewEmitContext()
	settled, _, exhausted := plugin.RunToFixedPoint(ec, stages, mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatal("resolve inline pipeline exhausted maxPasses — did not settle")
	}
	// Surface a surviving primitive as a diagnostic, exactly as the host sweep does.
	for _, d := range inlinetransform.Sweep(settled, artifacts) {
		diags = append(diags, d)
	}
	return reprint(ec, settled), diags
}

// exportConstValue returns the RHS text of `export const <name> = <value>;` in out.
func exportConstValue(t *testing.T, out, name string) string {
	t.Helper()
	marker := "const " + name + " = "
	i := strings.Index(out, marker)
	if i < 0 {
		t.Fatalf("no `const %s = ` in:\n%s", name, out)
	}
	rest := out[i+len(marker):]
	end := strings.Index(rest, ";")
	if end < 0 {
		t.Fatalf("unterminated `const %s = ` in:\n%s", name, out)
	}
	return strings.TrimSpace(rest[:end])
}

// TestResolveInlineTokenfulMatchesDiDirect: a tokenless `resolve<IThing>()` lowered
// through the INLINE pipeline (isSingular<IThing>() folds false, so the ternary
// collapses to `this.resolve(tokenfor<IThing>())`) is byte-identical to the di
// DIRECT stage's `resolve("<token>")`. resolveAsync / tryResolve share the shape.
func TestResolveInlineTokenfulMatchesDiDirect(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
interface IThing { id: number }
export const a = provider.resolve<IThing>();
export const b = provider.resolveAsync<IThing>();
export const c = provider.tryResolve<IThing>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics from the inline pipeline: %+v", diags)
	}
	diOut := lowerDi(t, prog, app)

	for _, name := range []string{"a", "b", "c"} {
		inlineVal := exportConstValue(t, inlineOut, name)
		diVal := exportConstValue(t, diOut, name)
		if inlineVal != diVal {
			t.Fatalf("resolve `%s` divergence:\n inline = %q\n di     = %q", name, inlineVal, diVal)
		}
		if !strings.Contains(inlineVal, `("`) || !strings.Contains(inlineVal, "IThing") {
			t.Fatalf("expected a tokenful resolve call carrying the IThing token, got %q", inlineVal)
		}
	}
}

// TestResolveInlineSingularShortCircuits: a `resolve<'dev'>()` over a SINGULAR type
// lowers — through isSingular<'dev'>()==true and the dead-branch fold — to the VALUE
// literal `"dev"` itself, NOT a resolve call, byte-identical to the di DIRECT stage's
// Rule-2 singular short-circuit. Proves the fold prunes the tokenful arm (and its
// tokenfor) away.
func TestResolveInlineSingularShortCircuits(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
export const a = provider.resolve<'dev'>();
export const b = provider.resolveAsync<42>();
export const c = provider.tryResolve<null>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics from the inline pipeline: %+v", diags)
	}
	diOut := lowerDi(t, prog, app)

	want := map[string]string{"a": `"dev"`, "b": "42", "c": "null"}
	for name, expect := range want {
		inlineVal := exportConstValue(t, inlineOut, name)
		diVal := exportConstValue(t, diOut, name)
		if inlineVal != diVal {
			t.Fatalf("singular `%s` divergence:\n inline = %q\n di     = %q", name, inlineVal, diVal)
		}
		if inlineVal != expect {
			t.Fatalf("singular `%s`: expected the value literal %q, got %q", name, expect, inlineVal)
		}
	}
}

// TestResolveInlineSettlesUnderLoop pins loop stability: the resolve family settles
// to a fixed point (no stage re-fires on the settled tree), so the loop terminates.
func TestResolveInlineSettlesUnderLoop(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
interface IThing { id: number }
export const a = provider.resolve<IThing>();
export const b = provider.resolve<'dev'>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	// A first settle, then re-running every looped stage over the settled tree must
	// be a pointer-identity no-op (handled inside RunToFixedPoint's detection; here
	// we simply assert it does not exhaust, i.e. it reached a fixed point).
	_, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
}

// TestResolveInlineFactoryFormResidual documents the FACTORY-form residual (§94, W6):
// a `resolve<() => IThing>()` shares the resolve body's discriminator (one type
// parameter, no value parameters) and so is claimed by the inline body, which lowers
// it as a non-singular tokenful resolve — but a function type derives no token, so
// the inline pipeline reports a LOUD lowering failure (never a silent mislowering),
// while the di DIRECT stage still lowers it to the renamed `resolveFactory(...)`.
// The rename is deferred to W6; until then the di stage keeps handling the factory
// form for di-direct consumers. This test pins BOTH sides of that residual.
func TestResolveInlineFactoryFormResidual(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
interface IThing { id: number }
export const f = provider.resolve<() => IThing>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	// di direct: the oracle renames to resolveFactory.
	diOut := lowerDi(t, prog, app)
	if !strings.Contains(diOut, ".resolveFactory(") {
		t.Fatalf("di direct must lower the factory form to resolveFactory:\n%s", diOut)
	}

	// inline: a loud lowering failure (an underivable-token or surviving-primitive
	// diagnostic), never a silent wrong resolve.
	_, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) == 0 {
		t.Fatal("expected a loud lowering diagnostic for the factory-form resolve under inline (the residual is loud, not silent)")
	}
}

package nameoftransform

import (
	"path/filepath"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/factorytransform"
	"github.com/fnioc/std/transforms/internal/foldtransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/singulartransform"
	"github.com/fnioc/std/transforms/internal/valueoftransform"
)

// buildResolveInlineWorkspace lays out the RESOLVE-family inline workspace: a core
// package literally named `@rhombus-std/di.core` carrying the runtime resolve
// surface plus the `rhombus.inline` resolve / resolveAsync / tryResolve entries and
// the real `ResolverInline` body
// (`resolve<T>() => isSingular<T>() ? singularValue<T>() : this.resolve(tokenof<T>())`),
// so the SAME tokenless resolve call can be lowered two ways — through the INLINE
// pipeline (inline -> tokenof -> singular -> fold) and through the di DIRECT stage
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
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
`)
	// The real ResolverInline body, authored over the compile-time primitives —
	// tokenof from the runtime leaf (raw DeriveTokenF, alias-preserving so a keyed T
	// keeps its Keyed<...> brand rather than stripping to the bare base), isSingular /
	// singularValue from the token-grammar transformer. Each verb calls ITSELF with the
	// derived token; a SINGULAR T folds to its value.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenof } from '@rhombus-std/primitives.extras';
import { isFactory, isSingular, paramtokensfor, returntokenfor, singularValue } from '@rhombus-std/primitives.extras';
interface IInlineResolveTarget {
  resolve(token: string): any;
  resolveAsync(token: string): any;
  tryResolve(token: string): any;
  resolveFactory(type: string, params?: readonly string[]): any;
}
export const ResolverInline = {
  resolve<T>(this: IInlineResolveTarget): T {
    return isSingular<T>() ? singularValue<T>() : isFactory<T>() ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>()) : this.resolve(tokenof<T>());
  },
  resolveAsync<T>(this: IInlineResolveTarget): Promise<T> | T {
    return isSingular<T>() ? singularValue<T>() : this.resolveAsync(tokenof<T>());
  },
  tryResolve<T>(this: IInlineResolveTarget): T | undefined {
    return isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenof<T>());
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
	sigT := signaturetransform.New(prog, ctx, artifacts, func(signatures.Diagnostic) {})
	keyofT := keyoftransform.New(prog, ctx, artifacts, sink)
	valueofT := valueoftransform.New(prog, ctx, artifacts, sink)
	singularT := singulartransform.New(prog, ctx, artifacts, sink)
	factoryT := factorytransform.New(prog, ctx, artifacts, sink)
	foldT := foldtransform.New(prog, sink)
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the resolve entries did not resolve")
	}
	stages := []plugin.FileTransform{inlineT, nameofT, sigT, keyofT, valueofT, singularT, factoryT, foldT}
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

// TestResolveInlineFactoryFormLowers pins the FACTORY form (§94 factory half, W6p2
// item 3): a `resolve<(a: IA) => IThing>()` lowers through the inline pipeline —
// isSingular false, isFactory TRUE, the fold keeps the factory arm — to
// `resolveFactory("<returnToken>", ["<paramToken>", ...])`, byte-identical to the di
// DIRECT stage's `resolveFactory` rename + param-token array. A ZERO-parameter
// factory drops the trailing array, matching di-direct's bare `resolveFactory(token)`.
func TestResolveInlineFactoryFormLowers(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
interface IA { id: number }
interface IThing { id: number }
export const withParam = provider.resolve<(a: IA) => IThing>();
export const noParam = provider.resolve<() => IThing>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics from the inline pipeline: %+v", diags)
	}
	diOut := lowerDi(t, prog, app)

	for _, name := range []string{"withParam", "noParam"} {
		inlineVal := exportConstValue(t, inlineOut, name)
		diVal := exportConstValue(t, diOut, name)
		if inlineVal != diVal {
			t.Fatalf("factory resolve `%s` divergence:\n inline = %q\n di     = %q", name, inlineVal, diVal)
		}
		if !strings.Contains(inlineVal, "resolveFactory(") {
			t.Fatalf("factory resolve `%s` must lower to resolveFactory, got %q", name, inlineVal)
		}
	}
	// The param-carrying factory keeps the param-token array; the no-arg one drops it.
	if v := exportConstValue(t, inlineOut, "withParam"); !strings.Contains(v, "[") {
		t.Fatalf("param-carrying factory must carry a param-token array, got %q", v)
	}
	if v := exportConstValue(t, inlineOut, "noParam"); strings.Contains(v, "[") {
		t.Fatalf("no-arg factory must ELIDE the param-token array, got %q", v)
	}
}

// TestResolveInlineKeyedMatchesDiDirect is the KEYED resolve-family parity net (the
// finding this test was added for): a tokenless `resolve<Keyed<ICache, "redis">>()`
// lowered through the INLINE pipeline must be byte-identical to the di DIRECT
// stage's `resolve("<token>")`. The resolve body derives the single token with
// `tokenof<T>()` (raw DeriveTokenF, alias-preserving), NOT `tokenfor<T>()` (which
// strips the Keyed<T, K> brand to the bare base) — so the emitted token carries the
// raw `Keyed<...>` reference both di-direct's DeriveTokenF and the inline body mint,
// rather than the brand-stripped base that would SILENTLY match an unkeyed
// registration of the same interface. resolveAsync / tryResolve share the shape.
// Unlike keyed REGISTRATION (where inline splits base + keyof and di composes
// base#key, so the two paths legitimately diverge), the single-token resolve form
// is byte-identical across paths, which is what this test pins.
func TestResolveInlineKeyedMatchesDiDirect(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
import type { Keyed } from '@rhombus-std/di.core';
interface ICache { id: number }
export const a = provider.resolve<Keyed<ICache, 'redis'>>();
export const b = provider.resolveAsync<Keyed<ICache, 'redis'>>();
export const c = provider.tryResolve<Keyed<ICache, 'redis'>>();
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
			t.Fatalf("keyed resolve `%s` divergence:\n inline = %q\n di     = %q", name, inlineVal, diVal)
		}
		// The token must carry the RAW Keyed<...> reference (alias-preserving), never
		// the brand-stripped bare base an unkeyed registration would answer.
		if !strings.Contains(inlineVal, "Keyed<") || !strings.Contains(inlineVal, "redis") {
			t.Fatalf("keyed resolve `%s`: expected a raw Keyed<...> token carrying the key, got %q", name, inlineVal)
		}
	}
}

// TestResolveInlineSingularGrammar exercises the FULL Rule-2 singular grammar
// through the inline resolve pipeline — boolean literals, a negative number, a
// bigint (positive + negative), and the void/undefined singleton — the branches of
// singular.go's literalExpression the earlier `'dev'`/42/null cases never reached.
// Each `resolve<Lit>()` short-circuits (isSingular true → the fold prunes the token
// arm) to the value literal itself, byte-identical to the di-direct Rule-2 emit.
func TestResolveInlineSingularGrammar(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
export const bt = provider.resolve<true>();
export const bf = provider.resolve<false>();
export const neg = provider.resolve<-5>();
export const big = provider.resolve<7n>();
export const bigNeg = provider.resolve<-9n>();
export const undef = provider.resolve<undefined>();
export const vd = provider.resolve<void>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics from the inline pipeline: %+v", diags)
	}
	diOut := lowerDi(t, prog, app)

	want := map[string]string{
		"bt": "true", "bf": "false", "neg": "-5", "big": "7n", "bigNeg": "-9n",
		"undef": "void 0", "vd": "void 0",
	}
	for name, expect := range want {
		inlineVal := exportConstValue(t, inlineOut, name)
		diVal := exportConstValue(t, diOut, name)
		if inlineVal != diVal {
			t.Fatalf("singular `%s` divergence:\n inline = %q\n di     = %q", name, inlineVal, diVal)
		}
		if inlineVal != expect {
			t.Fatalf("singular `%s`: expected value literal %q, got %q", name, expect, inlineVal)
		}
	}
}

// TestResolveInlineLiteralUnionIsNotSingular pins the NOT-singular union case: a
// `resolve<'a' | 'b'>()` over a pure literal union is NOT singular (SingletonValue
// returns ok=false for a union), so isSingular folds FALSE and the resolve lowers to
// the tokenful form carrying the sorted literal-union token — never a value
// short-circuit. Byte-identical to di-direct, which classifies the same way.
func TestResolveInlineLiteralUnionIsNotSingular(t *testing.T) {
	src := `import { provider } from '@rhombus-std/di.core';
export const u = provider.resolve<'a' | 'b'>();
`
	prog, app := buildResolveInlineWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	inlineOut, diags := lowerResolveInlinePipeline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics from the inline pipeline: %+v", diags)
	}
	diOut := lowerDi(t, prog, app)

	inlineVal := exportConstValue(t, inlineOut, "u")
	diVal := exportConstValue(t, diOut, "u")
	if inlineVal != diVal {
		t.Fatalf("literal-union resolve divergence:\n inline = %q\n di     = %q", inlineVal, diVal)
	}
	// A union is not singular: it stays a tokenful resolve call, no value collapse.
	if !strings.Contains(inlineVal, ".resolve(\"") {
		t.Fatalf("literal-union resolve should stay a tokenful resolve call, got %q", inlineVal)
	}
	if !strings.Contains(inlineVal, "a") || !strings.Contains(inlineVal, "b") {
		t.Fatalf("literal-union token should carry both members, got %q", inlineVal)
	}
}

// buildSourceWrittenSingularWorkspace lays out a workspace whose main.ts HAND-WRITES
// `isSingular<T>()` / `singularValue<T>()` calls (imported from a stub package),
// with NO inline substitution in play — so the singular stage anchors each call
// through `sourceWrittenType` (the checker-resolved callee path), the branch the
// inline-substituted (artifacts) tests never reach.
func buildSourceWrittenSingularWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	prims := filepath.Join(root, "packages", "primitives.extras")
	writeFile(t, filepath.Join(prims, "package.json"), `{
  "name": "@rhombus-std/primitives.extras",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	writeFile(t, filepath.Join(prims, "src", "index.ts"), `export declare function isSingular<T>(): boolean;
export declare function singularValue<T>(): T;
`)

	app := filepath.Join(root, "packages", "app")
	writeFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": { "@rhombus-std/primitives.extras": "workspace:*" }
}`)
	linkPkg(t, app, "@rhombus-std/primitives.extras", prims)
	writeFile(t, filepath.Join(app, "main.ts"), mainSrc)
	writeFile(t, filepath.Join(app, "tsconfig.json"), `{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "files": ["main.ts", "node_modules/@rhombus-std/primitives.extras/src/index.ts"]
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

// TestSingularSourceWrittenAnchor exercises singular.go's sourceWrittenType branch:
// with artifacts=nil (no inline stage), a hand-written `isSingular<T>()` lowers to a
// boolean literal and a hand-written `singularValue<T>()` over a singular T lowers to
// the value — anchored purely through the checker-resolved callee. A non-singular
// `isSingular<T>()` lowers to `false`, and a non-singular `singularValue<T>()` is
// left UN-LOWERED (the survivor the emit sweep would flag).
func TestSingularSourceWrittenAnchor(t *testing.T) {
	src := `import { isSingular, singularValue } from '@rhombus-std/primitives.extras';
interface IThing { id: number }
export const a = isSingular<'dev'>();
export const b = singularValue<'dev'>();
export const c = isSingular<IThing>();
export const d = singularValue<IThing>();
`
	prog, app := buildSourceWrittenSingularWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	ctx := plugin.NewContext(prog, app)
	transform := singulartransform.New(prog, ctx, nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()
	out := reprint(ec, transform(ec, mainSF(t, prog)))

	if got := exportConstValue(t, out, "a"); got != "true" {
		t.Fatalf("source-written isSingular<'dev'>(): got %q, want true", got)
	}
	if got := exportConstValue(t, out, "b"); got != `"dev"` {
		t.Fatalf("source-written singularValue<'dev'>(): got %q, want \"dev\"", got)
	}
	if got := exportConstValue(t, out, "c"); got != "false" {
		t.Fatalf("source-written isSingular<IThing>(): got %q, want false", got)
	}
	// A non-singular singularValue is left un-lowered — the call survives verbatim.
	if got := exportConstValue(t, out, "d"); !strings.Contains(got, "singularValue") {
		t.Fatalf("source-written singularValue<IThing>() should survive un-lowered, got %q", got)
	}
}

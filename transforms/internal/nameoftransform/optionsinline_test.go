package nameoftransform

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

// canonicalAddOptions is the byte-identical two-token lowering the retired
// dioptionstransform stage pinned (its idempotence test asserted exactly this
// string). The addOptions<T>() sugar now lowers through the generic inline body +
// the tokenfor stage's COMPOSED-generic derivation, and it must reproduce this
// canonical form: the closed-generic wrapper `IOptions<T>` token (composed inner
// via DeriveTokenF) and the bare element `T` token (`tokenof<T>()`, the RAW
// DeriveTokenF derivation). Both leaves derive the same raw way, so the wrapper's
// inner and the element stay relationally locked — including for a brand-carrying
// element (TestAddOptionsInlineKeyedElementLocksWrapperAndElement). The wrapper
// base is `@rhombus-std/options:IOptions` (the peered options package's root
// export) and the element is the app-internal `@scope/app/main:UserOptions`.
const canonicalAddOptions = `.addOptions("@rhombus-std/options:IOptions<@scope/app/main:UserOptions>", "@scope/app/main:UserOptions")`

// buildOptionsInlineWorkspace lays out the W4 addOptions workspace: a real on-disk
// `@rhombus-std/options` exporting a generic `IOptions<T>` (the composed wrapper
// base the tokenfor stage resolves against the program), a core package literally
// named `@rhombus-std/di.core` carrying the `addOptions` rhombus.inline entry with
// its real body (`addOptions<T>() => this.addOptions(tokenfor<IOptions<T>>(),
// tokenfor<T>())`), and a consumer main.ts that spells the sugar. It is the fixture
// the addOptions inline-parity, failure-path, and loop-stability tests drive.
//
// withOptions toggles whether the options package is loaded in the program: with it
// the composed base resolves and the sugar lowers; without it ResolveExportedSymbol
// finds no `@rhombus-std/options` and the tokenfor stage reports the absent-base
// 990020 diagnostic (the failure parity the retired stage emitted for a missing
// options package).
func buildOptionsInlineWorkspace(t *testing.T, mainSrc string, withOptions bool) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	opts := filepath.Join(root, "packages", "options")
	writeFile(t, filepath.Join(opts, "package.json"), `{
  "name": "@rhombus-std/options",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
}`)
	writeFile(t, filepath.Join(opts, "src", "index.ts"), "export interface IOptions<T> { readonly value: T; }\n")

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus.inline": {
    "entries": [
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "ManifestOptionsInline", "member": "addOptions" }
    ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IServiceManifestBase {
  addOptions(token: string, tToken: string): unknown;
}
export declare const services: IServiceManifestBase;
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };
`)
	// The real addOptions sugar body, authored over the compile-time tokenfor
	// primitive (from primitives) and the body-external IOptions type (from the
	// peered options package). Side-parsed substitution source — never in the app's
	// typecheck program, so its imports need not resolve on disk here.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor, tokenof } from '@rhombus-std/primitives.extras';
import type { IOptions } from '@rhombus-std/options';
import type { IServiceManifestBase } from './index';
export const ManifestOptionsInline = {
  addOptions<T>(this: IServiceManifestBase): unknown {
    return this.addOptions(tokenfor<IOptions<T>>(), tokenof<T>());
  },
};
`)

	app := filepath.Join(root, "packages", "app")
	appDeps := `{ "@rhombus-std/di.core": "workspace:*", "@rhombus-std/options": "workspace:*" }`
	if !withOptions {
		appDeps = `{ "@rhombus-std/di.core": "workspace:*" }`
	}
	writeFile(t, filepath.Join(app, "package.json"), `{
  "name": "@scope/app",
  "version": "1.0.0",
  "dependencies": `+appDeps+`
}`)
	linkPkg(t, app, "@rhombus-std/di.core", core)
	if withOptions {
		linkPkg(t, app, "@rhombus-std/options", opts)
	}

	// The tokenless addOptions<T>() sugar overload, declaration-merged onto di.core's
	// IServiceManifestBase — the declaration site the inline resolver anchors on.
	// The two-token verb and the `addOptions<I>(token, makeBase)` overload
	// (@rhombus-std/options.augmentations contributes both alongside the sugar) are
	// included so the resolver discriminates the (1, []) sugar overload against a
	// SECOND type-param-count-1 overload — the exact merged shape the real program
	// carries, which a two-overload fixture would not exercise.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addOptions<T>(): unknown;
    addOptions(token: string, tToken: string): unknown;
    addOptions<I>(token: string, makeBase: () => I): unknown;
  }
}
export {};
`)
	writeFile(t, filepath.Join(app, "main.ts"), mainSrc)

	files := `["main.ts", "sugar.d.ts", "node_modules/@rhombus-std/di.core/src/index.ts"`
	if withOptions {
		files += `, "node_modules/@rhombus-std/options/src/index.ts"`
	}
	files += `]`
	writeFile(t, filepath.Join(app, "tsconfig.json"), `{
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

// lowerOptionsInline runs the addOptions inline pipeline over main.ts — inline
// substitution then the tokenfor stage (which lowers both the composed
// `tokenfor<IOptions<T>>()` and the bare `tokenfor<T>()`) — and returns the
// reprinted output plus any tokenfor-stage diagnostics.
func lowerOptionsInline(t *testing.T, prog *driver.Program, app string) (string, []plugin.Diagnostic) {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	artifacts := inlinetransform.NewArtifacts()
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	var diags []plugin.Diagnostic
	inlineT := inlinetransform.Build(prog, bodies, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(d plugin.Diagnostic) { diags = append(diags, d) })
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the addOptions entry did not resolve")
	}
	ec := shimprinter.NewEmitContext()
	out := reprint(ec, nameofT(ec, inlineT(ec, mainSF(t, prog))))
	return out, diags
}

// TestAddOptionsInlineLowersTwoTokenForm is the load-bearing W4 parity proof: the
// tokenless `services.addOptions<UserOptions>()` lowered through the inline body +
// the tokenfor stage's composed-generic derivation reproduces the SAME
// byte-identical two-token verb the retired dioptionstransform stage emitted — the
// closed-generic `IOptions<UserOptions>` wrapper and the bare `UserOptions` element,
// relationally locked. This is the frozen-string regression net that outlives the
// deleted stage (its idempotence test pinned the identical string).
func TestAddOptionsInlineLowersTwoTokenForm(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface UserOptions { name: string; }
services.addOptions<UserOptions>();
`
	prog, app := buildOptionsInlineWorkspace(t, src, true)
	defer func() { _ = prog.Close() }()

	out, diags := lowerOptionsInline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics lowering addOptions<UserOptions>(): %+v", diags)
	}
	if !strings.Contains(out, canonicalAddOptions) {
		t.Fatalf("addOptions<UserOptions>() did not lower to the canonical two-token verb\n want substring: %s\n got:\n%s", canonicalAddOptions, out)
	}
	// No authoring survivors: neither the sugar type-arg nor the tokenfor primitive.
	if strings.Contains(out, "addOptions<") {
		t.Fatalf("the sugar type argument survived lowering:\n%s", out)
	}
	if strings.Contains(out, "tokenfor") {
		t.Fatalf("a tokenfor primitive survived lowering:\n%s", out)
	}
}

// TestAddOptionsInlineKeyedElementLocksWrapperAndElement is the brand-carrying
// element parity net: when T is a `Keyed<IFoo, "k">`, the wrapper's inner token
// and the bare element token must STILL be minted from the one derivation, so the
// registered `IOptions<element>` and the `element` it wraps agree — the relational
// lock the two-token verb depends on. The element uses `tokenof<T>()` (the RAW,
// alias-preserving derivation), NOT `tokenfor<T>()` (which strips the Keyed brand
// to the bare base for keyed SERVICE registration); the composed wrapper's inner
// leaf derives the same RAW way, so the pair is locked. Without it the wrapper
// carried `IOptions<...Keyed<...>>` while the element carried the stripped base —
// a mismatched pair diverging from the retired stage's single-derivation lowering.
func TestAddOptionsInlineKeyedElementLocksWrapperAndElement(t *testing.T) {
	src := `import { services, Keyed } from '@rhombus-std/di.core';
interface IFoo { name: string; }
services.addOptions<Keyed<IFoo, "k">>();
`
	prog, app := buildOptionsInlineWorkspace(t, src, true)
	defer func() { _ = prog.Close() }()

	out, diags := lowerOptionsInline(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics lowering addOptions<Keyed<IFoo,\"k\">>(): %+v", diags)
	}
	// A TS string literal may embed escaped quotes (a keyed token carries `\"k\"`),
	// so match the two literals with an escape-aware pattern and strip the outer
	// quotes to compare their inner token content.
	lit := `"(?:\\.|[^"\\])*"`
	m := regexp.MustCompile(`\.addOptions\((` + lit + `), (` + lit + `)\)`).FindStringSubmatch(out)
	if m == nil {
		t.Fatalf("addOptions did not lower to the two-token verb:\n%s", out)
	}
	wrapper, element := m[1][1:len(m[1])-1], m[2][1:len(m[2])-1]
	// Relational lock: the wrapper is IOptions<element> over the SAME element token
	// the second argument carries — both minted from the one raw derivation.
	if want := "@rhombus-std/options:IOptions<" + element + ">"; wrapper != want {
		t.Fatalf("wrapper/element not locked for a keyed element:\n wrapper: %s\n element: %s\n want wrapper: %s", wrapper, element, want)
	}
	// The keyed element derives RAW (the aliased Keyed<...> reference), never the
	// brand-stripped bare base a keyed service registration would use.
	if !strings.Contains(element, "Keyed<") {
		t.Fatalf("keyed element should carry the raw Keyed<...> token, got %q", element)
	}
}

// TestAddOptionsInlineAbsentOptionsReportsDiagnostic is the absent-options failure
// parity: with `@rhombus-std/options` NOT in the program, the composed wrapper base
// cannot resolve, so the tokenfor stage reports the 990020 diagnostic (the exact
// code the retired stage emitted for a missing options package) and leaves the
// composed call un-lowered rather than emitting a silent empty token (constraint 9).
func TestAddOptionsInlineAbsentOptionsReportsDiagnostic(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface UserOptions { name: string; }
services.addOptions<UserOptions>();
`
	prog, app := buildOptionsInlineWorkspace(t, src, false)
	defer func() { _ = prog.Close() }()

	_, diags := lowerOptionsInline(t, prog, app)
	if !hasDiagnosticCode(diags, "990020") {
		t.Fatalf("expected a 990020 absent-options diagnostic, got %+v", diags)
	}
}

// TestAddOptionsInlineAnonymousElementReportsDiagnostic is the anonymous-T failure
// parity: with the options package present but the element type an anonymous inline
// object (`{ x: number }`), the wrapper's argument yields no token, so the tokenfor
// stage reports the 990020 diagnostic — the retired stage's msgNoElement failure,
// kept in quality and code.
func TestAddOptionsInlineAnonymousElementReportsDiagnostic(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
services.addOptions<{ x: number }>();
`
	prog, app := buildOptionsInlineWorkspace(t, src, true)
	defer func() { _ = prog.Close() }()

	_, diags := lowerOptionsInline(t, prog, app)
	if !hasDiagnosticCode(diags, "990020") {
		t.Fatalf("expected a 990020 anonymous-element diagnostic, got %+v", diags)
	}
}

// TestAddOptionsSettlesUnderLoop is the loop-stability net for the addOptions sugar
// (the same gap class that hid the W2 zero-arg re-match bug): a single fixed pass
// cannot surface a stage re-matching its own lowered output. The sugar is driven
// through plugin.RunToFixedPoint (inline + tokenfor) — it must SETTLE (never exhaust
// the pass cap) in a couple of passes, and re-running every stage over the settled
// tree must be a pointer-identity no-op, proving no stage re-fires on its own
// two-token output.
func TestAddOptionsSettlesUnderLoop(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface UserOptions { name: string; }
services.addOptions<UserOptions>();
`
	prog, app := buildOptionsInlineWorkspace(t, src, true)
	defer func() { _ = prog.Close() }()

	ctx := plugin.NewContext(prog, app)
	artifacts := inlinetransform.NewArtifacts()
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	stages := []plugin.FileTransform{
		inlinetransform.Build(prog, bodies, artifacts, func(plugin.Diagnostic) {}),
		New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
	}

	ec := shimprinter.NewEmitContext()
	settled, passes, exhausted := plugin.RunToFixedPoint(ec, stages, mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatalf("addOptions did not settle within %d passes", loopMaxPasses)
	}
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the addOptions entry did not resolve")
	}
	if passes > 4 {
		t.Errorf("addOptions took %d passes to settle, want <= 4", passes)
	}
	settledOut := reprint(ec, settled)
	if !strings.Contains(settledOut, canonicalAddOptions) {
		t.Fatalf("settled output is not the canonical two-token form:\n%s", settledOut)
	}
	for i, stage := range stages {
		if out := stage(ec, settled); out != settled {
			t.Errorf("settled-tree stage %d re-fired (%p != %p) — the loop would not terminate", i, out, settled)
		}
	}
}

// hasDiagnosticCode reports whether any diagnostic in diags carries code.
func hasDiagnosticCode(diags []plugin.Diagnostic, code string) bool {
	for _, d := range diags {
		if d.Code == code {
			return true
		}
	}
	return false
}

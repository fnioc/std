package nameoftransform

import (
	"path/filepath"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/schemaoftransform"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
)

// loopMaxPasses mirrors stdhost.maxLoopPasses for the tests that drive
// plugin.RunToFixedPoint directly (stdhost cannot be imported here — it depends on
// this package).
const loopMaxPasses = 16

// buildChainWorkspace stands up a di.core-as-source workspace whose registration
// chain carries a second type-driven append sugar (`withSignature<T>()`), so the
// full inline pipeline lowers a realistic `addClass<I>(C).withSignature<T>()`
// two-hop chain — the fixture the loop-settling tests below drive.
func buildChainWorkspace(t *testing.T, mainSrc string) (*driver.Program, string) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{ "name": "ws", "private": true, "workspaces": ["packages/*"] }`)

	core := filepath.Join(root, "packages", "di.core")
	writeFile(t, filepath.Join(core, "package.json"), `{
  "name": "@rhombus-std/di.core",
  "version": "1.0.0",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "rhombus-std": {
    "inline": [
      { "type": "@rhombus-std/di.core:IServiceManifestBase", "impl": "@rhombus-std/di.core:ChainInline", "member": "addClass" },
      { "type": "@rhombus-std/di.core:IWithSignatureBuilder", "impl": "@rhombus-std/di.core:ChainInline", "member": "withSignature" }
    ]
  }
}`)
	writeFile(t, filepath.Join(core, "src", "index.ts"), `export interface IWithSignatureBuilder {
  withSignature(token: unknown): IChain;
}
export interface IChain extends IWithSignatureBuilder {}
export interface IServiceManifestBase {
  addClass(token: string, ctor: unknown, sig: unknown, scope?: string, key?: string): IChain;
}
export declare const services: IServiceManifestBase;
`)
	// The inline bodies: addClass derives token + dep-array, withSignature appends a
	// second type-driven token onto the chain.
	writeFile(t, filepath.Join(core, "src", "inline.ts"), `import { tokenfor } from '@rhombus-std/primitives.extras';
import { signatureof } from '@rhombus-std/di.extras';
import type { IChain, IServiceManifestBase, IWithSignatureBuilder } from './index';
export const ChainInline = {
  addClass<T>(this: IServiceManifestBase, ctor: unknown): IChain {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor));
  },
  withSignature<T>(this: IWithSignatureBuilder): IChain {
    return this.withSignature(tokenfor<T>());
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

	// The consumer augmentation mirroring di.extras's real declare-module: the
	// type-driven addClass<T>() / withSignature<T>() overloads merge onto their
	// respective di.core faces.
	writeFile(t, filepath.Join(app, "sugar.d.ts"), `declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase {
    addClass<T>(ctor: unknown): IChain;
  }
  interface IWithSignatureBuilder {
    withSignature<T>(): IChain;
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

// buildLoopedStages constructs every looped-set stage over prog, sharing ONE
// artifacts bag exactly as the owner host composes them, and returns them in the
// canonical order. Mergesynth is deliberately excluded — it is the host's one-shot
// pre-pass, not a loop member (Open issue 2). Every stage is now a domain-agnostic
// primitive — the bespoke di / di_options / config stages were deleted (W6p3) — so
// the no-op identity contract is pinned across the whole primitive looped set.
func buildLoopedStages(t *testing.T, prog *driver.Program, app string, artifacts *inlinetransform.Artifacts) []plugin.FileTransform {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	inlineT := inlinetransform.Build(prog, bodies, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	sigT := signaturetransform.New(prog, ctx, artifacts, func(signatures.Diagnostic) {})
	schemaofT := schemaoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	return []plugin.FileTransform{inlineT, nameofT, sigT, schemaofT}
}

// TestLoopCanaryZeroMatchPreservesPointer is the CENTRAL identity canary: a file
// with ZERO matches for every looped stage must come back as the IDENTICAL
// *SourceFile pointer from each stage. This verifies the shim's VisitEachChild /
// factory-Update contract once — a no-op visitor returns the same node, and each
// stage's tail helpers (import elision, temp hoist, spread flatten, optional-import
// injection) return their input unchanged when they change nothing. The fixed-point
// loop's TERMINATION depends entirely on this contract: if any stage returned a
// fresh pointer on a no-op, `result == before` would never hold and the loop would
// spin to FIXED_POINT_EXHAUSTED.
func TestLoopCanaryZeroMatchPreservesPointer(t *testing.T) {
	// A file with no sugar call and no primitive call — nothing any looped stage can
	// match — but the inline entries still RESOLVE (artifacts Active), so the inline
	// stage runs its real visitor rather than the trivial no-entry no-op closure.
	prog, app := buildChainWorkspace(t, "export const x = 1;\n")
	defer func() { _ = prog.Close() }()

	artifacts := inlinetransform.NewArtifacts()
	stages := buildLoopedStages(t, prog, app, artifacts)
	names := []string{"inline", "nameof", "signatureof", "schemaof"}

	ec := shimprinter.NewEmitContext()
	sf := mainSF(t, prog)
	for i, stage := range stages {
		out := stage(ec, sf)
		if out != sf {
			t.Errorf("stage %q rebuilt a zero-match file (returned %p, want the input %p) — this breaks the loop's pointer-identity fixed-point detection", names[i], out, sf)
		}
	}
}

// TestLoopNoOpIdentityTable is the table-driven guard so a FUTURE stage cannot
// silently regress the no-op identity contract: it settles a file through the
// WHOLE looped set to a fixed point, then runs every looped stage once more over
// that fully-settled tree and asserts the pointer is preserved. Where the canary
// proves a stage is inert on a file it never touches, this proves a stage is inert
// on the fully-lowered output — the EXACT shape the loop's terminating
// (fixed-point-detecting) pass hands every stage. A stage that re-fired on the
// settled tree would spin the loop to FIXED_POINT_EXHAUSTED.
//
// The whole looped set is now domain-agnostic primitives (the bespoke di /
// di_options / config stages were deleted in W6p3): the inline stage peels the
// addClass chain and the primitives lower each layer, so every stage's inertness
// check here is against the fully-settled output the loop's terminating pass hands
// it. schemaof finds no `.withType` sugar in this fixture and is pinned inert on
// the settled tree.
func TestLoopNoOpIdentityTable(t *testing.T) {
	// The full chain, lowered ONCE through the whole set to its fixed point, is the
	// "already settled" input every looped stage is then re-run over.
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
interface IDep {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).withSignature<IDep>();
`
	prog, app := buildChainWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	artifacts := inlinetransform.NewArtifacts()
	stages := buildLoopedStages(t, prog, app, artifacts)
	names := []string{"inline", "nameof", "signatureof", "schemaof"}

	ec := shimprinter.NewEmitContext()
	settled, _, exhausted := plugin.RunToFixedPoint(ec, stages, mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatal("looped set exhausted maxPasses while settling the fixture")
	}

	for i, stage := range stages {
		out := stage(ec, settled)
		if out != settled {
			t.Errorf("settled-file stage %q re-fired on the fixed-point output (returned %p, want %p) — the loop would never terminate", names[i], out, settled)
		}
	}
}

// TestRunToFixedPointExhaustsWhenNonSettling pins the loud-cap contract: a stage
// that is NOT identity-preserving on a no-op (it hands back a fresh pointer every
// pass) must make RunToFixedPoint stop at the cap and report exhausted=true —
// never spin forever, never silently cap. The host turns that bool into the
// FIXED_POINT_EXHAUSTED per-file error. Modeled with a flip-flop transform that
// alternates between two distinct source-file pointers, so no pass is ever a no-op.
//
// It settles on maxPasses+1 CHANGED passes, not maxPasses. Exhaustion is only ever
// OBSERVED: a changing pass says nothing about whether the next one would change
// anything, so a file that uses its whole budget still gets its confirming pass
// before the loop concludes it is not settling. The one extra pass here is what a
// file settling on exactly maxPasses passes spends being correctly reported as
// settled instead of failing the run (plugin.RunToFixedPoint).
func TestRunToFixedPointExhaustsWhenNonSettling(t *testing.T) {
	prog, app := buildChainWorkspace(t, "export const x = 1;\nexport const y = 2;\n")
	defer func() { _ = prog.Close() }()
	_ = app

	ec := shimprinter.NewEmitContext()
	factory := ec.Factory.AsNodeFactory()
	a := mainSF(t, prog)
	// b: a distinct rebuild of a with a duplicated statement, so it is guaranteed a
	// different *SourceFile pointer (different child count — the factory cannot dedup
	// it to a).
	dup := append([]*shimast.Node{}, a.Statements.Nodes...)
	dup = append(dup, a.Statements.Nodes[0])
	b := factory.UpdateSourceFile(a, factory.NewNodeList(dup), a.EndOfFileToken).AsSourceFile()
	if b == a {
		t.Fatal("could not build a distinct source-file pointer for the non-settling fixture")
	}

	flip := func(_ *shimprinter.EmitContext, sf *shimast.SourceFile) *shimast.SourceFile {
		if sf == a {
			return b
		}
		return a
	}

	settled, passes, exhausted := plugin.RunToFixedPoint(ec, []plugin.FileTransform{flip}, a, loopMaxPasses)
	if !exhausted {
		t.Fatal("a non-settling transform must exhaust the pass cap, got exhausted=false")
	}
	if passes != loopMaxPasses+1 {
		t.Errorf("exhaustion should report maxPasses+1 changed passes (the budget plus the pass that proved it was still changing), got %d want %d", passes, loopMaxPasses+1)
	}
	if settled != a && settled != b {
		t.Error("settled result should be one of the two flip-flop files")
	}
}

// buildSelfInlineLoop builds the inline + primitive stages (inline, nameof,
// signatureof — NO di stage) over a self-inline workspace, sharing ONE artifacts
// bag in canonical order. It is the inline-ISOLATION loop for the
// self-registration cases: excluding the di stage proves the inline path alone
// settles, the same isolation TestChainSettlesThroughInlinePrimitivesOnly uses for
// the chain.
func buildSelfInlineLoop(t *testing.T, prog *driver.Program, app string, artifacts *inlinetransform.Artifacts) []plugin.FileTransform {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	return []plugin.FileTransform{
		inlinetransform.Build(prog, bodies, artifacts, func(plugin.Diagnostic) {}),
		New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
		signaturetransform.New(prog, ctx, artifacts, func(signatures.Diagnostic) {}),
	}
}

// TestSelfRegistrationSettlesUnderLoop is the FINDING-3 loop-stability net for the
// no-type-arg self-registration forms — the same gap class that hid the W2 zero-arg
// re-match bug (a single fixed pass would never surface a stage re-matching its own
// lowered output). Each self form (addClass / addFactory / addValue, PLUS the
// tokenof raw-type addValue-of-a-function case the W3 fix introduced) is driven
// through plugin.RunToFixedPoint: it must SETTLE (never exhaust the pass cap) in a
// couple of passes, and re-running every stage over the settled tree must be a
// pointer-identity no-op — proving no stage re-fires on its own output.
func TestSelfRegistrationSettlesUnderLoop(t *testing.T) {
	cases := []struct {
		name string
		src  string
	}{
		{
			name: "addClass",
			src: `import { services } from '@rhombus-std/di.core';
interface IDb {}
class SqlUserRepo { constructor(db: IDb) { void db; } }
services.addClass(SqlUserRepo);
`,
		},
		{
			name: "addFactory",
			src: `import { services } from '@rhombus-std/di.core';
interface IDb {}
interface Thing {}
declare function makeThing(db: IDb): Thing;
services.addFactory(makeThing);
`,
		},
		{
			name: "addValue",
			src: `import { services } from '@rhombus-std/di.core';
interface AppConfig { host: string }
declare const cfg: AppConfig;
services.addValue(cfg);
`,
		},
		{
			// The W3-fix raw-type case: a callable value registered via addValue lowers
			// through tokenof (own type), not tokenfor (produced type). Its loop
			// stability is the case the fix must not regress.
			name: "addValue(fn) via tokenof",
			src: `import { services } from '@rhombus-std/di.core';
interface Thing {}
declare function makeThing(): Thing;
services.addValue(makeThing);
`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			prog, app := buildSelfInlineWorkspace(t, tc.src)
			defer func() { _ = prog.Close() }()

			artifacts := inlinetransform.NewArtifacts()
			stages := buildSelfInlineLoop(t, prog, app, artifacts)

			ec := shimprinter.NewEmitContext()
			settled, passes, exhausted := plugin.RunToFixedPoint(ec, stages, mainSF(t, prog), loopMaxPasses)
			if exhausted {
				t.Fatalf("%s did not settle within %d passes", tc.name, loopMaxPasses)
			}
			if !artifacts.Active {
				t.Fatalf("%s: inline artifacts not active — the self entry did not resolve", tc.name)
			}
			if passes > 4 {
				t.Errorf("%s took %d passes to settle, want <= 4", tc.name, passes)
			}
			for i, stage := range stages {
				if out := stage(ec, settled); out != settled {
					t.Errorf("%s: settled-tree stage %d re-fired (%p != %p) — the loop would not terminate", tc.name, i, out, settled)
				}
			}
		})
	}
}

// TestChainSettlesThroughInlinePrimitivesOnly is the W1 verification: a 2-deep
// registration chain `addClass<I>(C).withSignature<T>()` lowered through inline +
// the primitive stages ONLY (no di stage) must SETTLE under the fixed-point loop
// in a handful of passes — the inline visitor peels the outermost layer per pass,
// so the loop is what makes the inner chain position reachable at all.
func TestChainSettlesThroughInlinePrimitivesOnly(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
interface IDep {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).withSignature<IDep>();
`
	prog, app := buildChainWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	artifacts := inlinetransform.NewArtifacts()
	ctx := plugin.NewContext(prog, app)
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	loop := []plugin.FileTransform{
		inlinetransform.Build(prog, bodies, artifacts, func(plugin.Diagnostic) {}),
		New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
		signaturetransform.New(prog, ctx, artifacts, func(signatures.Diagnostic) {}),
	}

	ec := shimprinter.NewEmitContext()
	_, passes, exhausted := plugin.RunToFixedPoint(ec, loop, mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatalf("chain did not settle within %d passes", loopMaxPasses)
	}
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the chain entries did not resolve")
	}
	if passes > 4 {
		t.Errorf("2-deep chain took %d passes to settle, want <= 4", passes)
	}
}

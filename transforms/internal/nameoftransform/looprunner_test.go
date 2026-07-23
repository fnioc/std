package nameoftransform

import (
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/dioptionstransform"
	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/valueoftransform"
)

// loopMaxPasses mirrors stdhost.maxLoopPasses for the tests that drive
// plugin.RunToFixedPoint directly (stdhost cannot be imported here — it depends on
// this package).
const loopMaxPasses = 16

// buildLoopedStages constructs every looped-set stage over prog, sharing ONE
// artifacts bag exactly as the owner host composes them, and returns them in the
// canonical order. Mergesynth is deliberately excluded — it is the host's one-shot
// pre-pass, not a loop member (Open issue 2). The di / di_options / config stages
// are included so the no-op identity contract is pinned across the WHOLE looped
// set, not just the primitives.
func buildLoopedStages(t *testing.T, prog *driver.Program, app string, artifacts *inlinetransform.Artifacts) []plugin.FileTransform {
	t.Helper()
	ctx := plugin.NewContext(prog, app)
	bodies, cerr := inlinetransform.Collect(app)
	if cerr != nil {
		t.Fatalf("collect: %v", cerr)
	}
	inlineT := inlinetransform.Build(prog, bodies, artifacts, func(plugin.Diagnostic) {})
	nameofT := New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	sigT := signaturetransform.New(prog, ctx, artifacts, func(ditransform.Diagnostic) {})
	keyofT := keyoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	valueofT := valueoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {})
	diT := plugin.FileTransform(ditransform.New(prog, ctx, func(ditransform.Diagnostic) {}))
	diOptionsT := dioptionstransform.AddOptionsTransform(prog, ctx, func(plugin.Diagnostic) {})
	configT := configtransform.New(prog, ctx, func(plugin.Diagnostic) {})
	return []plugin.FileTransform{inlineT, nameofT, sigT, keyofT, valueofT, diT, diOptionsT, configT}
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
	prog, app := buildWithSigChainWorkspace(t, "export const x = 1;\n")
	defer func() { _ = prog.Close() }()

	artifacts := inlinetransform.NewArtifacts()
	stages := buildLoopedStages(t, prog, app, artifacts)
	names := []string{"inline", "nameof", "signatureof", "keyof", "valueof", "di", "di_options", "config"}

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
// silently regress the no-op identity contract: it runs each looped stage over an
// already-settled (fully-lowered) file and asserts the pointer is preserved. Where
// the canary proves a stage is inert on a file it never touches, this proves a
// stage is inert on a file it ALREADY lowered — the exact shape the loop's second
// (fixed-point-detecting) pass hands every stage. A stage that re-fired on its own
// output would loop forever.
func TestLoopNoOpIdentityTable(t *testing.T) {
	// The full chain, lowered ONCE to its fixed point, is the "already settled" input.
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
interface IDep {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).withSignature<[IDep]>().as<'scoped'>();
`
	prog, app := buildWithSigChainWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	artifacts := inlinetransform.NewArtifacts()
	stages := buildLoopedStages(t, prog, app, artifacts)
	names := []string{"inline", "nameof", "signatureof", "keyof", "valueof", "di", "di_options", "config"}

	ec := shimprinter.NewEmitContext()
	// Drive the primitive stages (indices 0-4) to a fixed point to produce the
	// settled tree — the di / di_options / config stages are NOT run here (they would
	// re-lower the still-sugar chain the primitives alone leave; this table pins that
	// each stage is inert on the PRIMITIVE-settled output, which is what the loop's
	// detecting pass sees when the primitives own the lowering).
	settled, _, exhausted := plugin.RunToFixedPoint(ec, stages[:5], mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatal("primitive loop exhausted maxPasses while settling the fixture")
	}

	for i, stage := range stages[:5] {
		out := stage(ec, settled)
		if out != settled {
			t.Errorf("settled-file stage %q re-fired on its own fixed-point output (returned %p, want %p) — the loop would never terminate", names[i], out, settled)
		}
	}
}

// TestRunToFixedPointExhaustsWhenNonSettling pins the loud-cap contract: a stage
// that is NOT identity-preserving on a no-op (it hands back a fresh pointer every
// pass) must make RunToFixedPoint stop at maxPasses and report exhausted=true —
// never spin forever, never silently cap. The host turns that bool into the
// FIXED_POINT_EXHAUSTED per-file error. Modeled with a flip-flop transform that
// alternates between two distinct source-file pointers, so no pass is ever a no-op.
func TestRunToFixedPointExhaustsWhenNonSettling(t *testing.T) {
	prog, app := buildWithSigChainWorkspace(t, "export const x = 1;\nexport const y = 2;\n")
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
	if passes != loopMaxPasses {
		t.Errorf("exhaustion should report exactly maxPasses changed passes, got %d want %d", passes, loopMaxPasses)
	}
	if settled != a && settled != b {
		t.Error("settled result should be one of the two flip-flop files")
	}
}

// TestChainSettlesThroughInlinePrimitivesOnly is the W1 verification: a 3-deep
// registration chain `addClass<I>(C).withSignature<T>().as<S>()` lowered through
// inline + the primitive stages ONLY (no di stage) must SETTLE under the
// fixed-point loop in a handful of passes — the inline visitor peels the outermost
// layer per pass, so the loop is what makes the inner chain positions reachable at
// all — and the settled output must equal the di stage's DIRECT lowering of the
// same source (the byte-parity oracle, which lowers every layer in one deep walk).
func TestChainSettlesThroughInlinePrimitivesOnly(t *testing.T) {
	src := `import { services } from '@rhombus-std/di.core';
interface IFoo {}
interface IDep {}
class Foo implements IFoo {}
services.addClass<IFoo>(Foo).withSignature<[IDep]>().as<'scoped'>();
`
	prog, app := buildWithSigChainWorkspace(t, src)
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
		signaturetransform.New(prog, ctx, artifacts, func(ditransform.Diagnostic) {}),
		keyoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
		valueoftransform.New(prog, ctx, artifacts, func(plugin.Diagnostic) {}),
	}

	ec := shimprinter.NewEmitContext()
	settled, passes, exhausted := plugin.RunToFixedPoint(ec, loop, mainSF(t, prog), loopMaxPasses)
	if exhausted {
		t.Fatalf("chain did not settle within %d passes", loopMaxPasses)
	}
	if !artifacts.Active {
		t.Fatal("inline artifacts not active — the chain entries did not resolve")
	}
	if passes > 4 {
		t.Errorf("3-deep chain took %d passes to settle, want <= 4", passes)
	}
	shimast.SetParentInChildrenUnset(settled.AsNode())
	inlineOut := reprint(ec, settled)

	diOut := lowerDi(t, prog, app)
	if inlineOut != diOut {
		t.Fatalf("inline+primitives loop output diverged from the di-direct oracle:\n--- inline (loop, %d passes) ---\n%s\n--- di direct ---\n%s", passes, inlineOut, diOut)
	}
}

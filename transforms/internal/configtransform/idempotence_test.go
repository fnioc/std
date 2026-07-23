package configtransform

import (
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
	shimprinter "github.com/microsoft/typescript-go/shim/printer"

	"github.com/fnioc/std/transforms/internal/plugin"
)

// TestConfigStageIdempotentOnOwnOutput pins the config stage's fixed-point-loop
// contract: after it lowers a `withType<T>()` receiver to `withSchema({...})`,
// running the SAME stage over its own output must return the IDENTICAL
// *SourceFile pointer. The stage is a looped member (stages.go), so the loop's
// terminating pass hands it the tree it already lowered; a stage that re-fired on
// that tree — an unconditional rebuild in a tail helper (the OPTIONAL
// import-injection path is the risk spot), or a matcher that re-recognizes its own
// emitted `withSchema` — would spin the loop to FIXED_POINT_EXHAUSTED. The
// nameoftransform table-driven no-op test cannot reach this: its fixture carries no
// config sugar, so config is inert there for want of a match, never against output
// it itself produced.
func TestConfigStageIdempotentOnOwnOutput(t *testing.T) {
	src := `import { ConfigBuilder } from "@rhombus-std/config";
interface Settings { name: string; count: number; nested: { flag: boolean }; }
declare const b: ConfigBuilder;
b.withType<Settings>();
`
	prog, sf := loadConfigProgram(t, src)
	defer func() { _ = prog.Close() }()

	transform := New(prog, nil, func(plugin.Diagnostic) {})
	ec := shimprinter.NewEmitContext()

	first := transform(ec, sf)
	if first == sf {
		t.Fatal("config stage did not lower the withType fixture — the idempotence check needs a real lowering to re-run over")
	}
	shimast.SetParentInChildrenUnset(first.AsNode())

	second := transform(ec, first)
	if second != first {
		t.Errorf("config stage re-fired on its own lowered output (returned %p, want %p) — the fixed-point loop would never terminate", second, first)
	}
}

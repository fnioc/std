package main

import (
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/dioptionstransform"
	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/nameoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// stagePrefix marks a manifest entry as one of this host's own stages. A
// descriptor name carrying it (e.g. "rhombusstd_nameof") selects the matching
// FileTransform; a prefixed name with no matching stage is a hard UNKNOWN_STAGE
// error, and a NON-prefixed entry is a foreign plugin handled by the linked
// machinery (or rejected when it is not linked) — see host.go.
const stagePrefix = "rhombusstd_"

// diagnosticSink receives one envelope diagnostic from a stage's transform.
type diagnosticSink func(envelopeDiagnostic)

// stageBuilder adapts a stage's native transform factory (each with its own
// diagnostic type) onto the shared FileTransform + envelope-diagnostic contract.
type stageBuilder func(prog *driver.Program, ctx *tokens.Context, emit diagnosticSink) plugin.FileTransform

// stageDef pairs a descriptor name with its transform builder.
type stageDef struct {
	name  string
	build stageBuilder
}

// canonicalStages is the fixed execution order every activated stage runs in:
// nameof first (so its token lowering and import elision land before di, which
// also recognizes nameof), then the registration verbs, then the addOptions
// sugar, then the config schema lowering. Manifest entry order does not affect
// this — selection filters this slice, preserving its order.
var canonicalStages = []stageDef{
	{name: stagePrefix + "nameof", build: buildNameof},
	{name: stagePrefix + "di", build: buildDi},
	{name: stagePrefix + "di_options", build: buildDiOptions},
	{name: stagePrefix + "config", build: buildConfig},
}

// stageByName indexes canonicalStages for O(1) manifest validation.
var stageByName = func() map[string]stageDef {
	m := make(map[string]stageDef, len(canonicalStages))
	for _, s := range canonicalStages {
		m[s.name] = s
	}
	return m
}()

// buildNameof activates the nameof lowering stage. It raises no diagnostics of
// its own today; any it did raise would be hard errors.
func buildNameof(prog *driver.Program, ctx *tokens.Context, emit diagnosticSink) plugin.FileTransform {
	return nameoftransform.New(prog, ctx, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

// buildDi activates the registration lowering stage. It is category-aware: a
// ditransform advisory Warning is reported without failing emit, matching the
// reference transformer where only hard errors gate the build.
func buildDi(prog *driver.Program, ctx *tokens.Context, emit diagnosticSink) plugin.FileTransform {
	transform := ditransform.New(prog, ctx, func(d ditransform.Diagnostic) {
		emit(envelopeFromDi(d))
	})
	return plugin.FileTransform(transform)
}

// buildDiOptions activates the addOptions<T>() sugar lowering stage. Every
// diagnostic it raises is a hard error.
func buildDiOptions(prog *driver.Program, ctx *tokens.Context, emit diagnosticSink) plugin.FileTransform {
	return dioptionstransform.AddOptionsTransform(prog, ctx, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

// buildConfig activates the withType->withSchema lowering stage. Every
// diagnostic it raises is a hard error.
func buildConfig(prog *driver.Program, ctx *tokens.Context, emit diagnosticSink) plugin.FileTransform {
	return configtransform.New(prog, ctx, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

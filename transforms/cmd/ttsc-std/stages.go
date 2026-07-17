package main

import (
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/dioptionstransform"
	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
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

// stageEnv carries the cross-stage state a builder may need: the project working
// directory (the inline stage's collector root) and the per-run inline artifacts
// (populated by the inline stage, read by nameof and the emit sweep).
type stageEnv struct {
	cwd       string
	artifacts *inlinetransform.Artifacts
}

// stageBuilder adapts a stage's native transform factory (each with its own
// diagnostic type) onto the shared FileTransform + envelope-diagnostic contract.
type stageBuilder func(prog *driver.Program, ctx *tokens.Context, env *stageEnv, emit diagnosticSink) plugin.FileTransform

// stageDef pairs a descriptor name with its transform builder.
type stageDef struct {
	name  string
	build stageBuilder
}

// canonicalStages is the fixed execution order every activated stage runs in:
// inline first (so single-expression sugar bodies are substituted before any
// primitive stage runs), then nameof (its token lowering and import elision,
// including the inline stage's synthetic nameof calls), then the registration
// verbs, the addOptions sugar, and the config schema lowering. Manifest entry
// order does not affect this — selection filters this slice, preserving order.
var canonicalStages = []stageDef{
	{name: stagePrefix + "inline", build: buildInline},
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

// buildInline activates the generic single-expression inline stage. It collects
// the workspace publish list, substitutes matched sugar bodies, and registers
// the synthetic primitive calls the nameof stage lowers. Every diagnostic it
// raises is a hard error.
func buildInline(prog *driver.Program, _ *tokens.Context, env *stageEnv, emit diagnosticSink) plugin.FileTransform {
	return inlinetransform.Build(prog, env.cwd, env.artifacts, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

// buildNameof activates the nameof lowering stage. It raises no diagnostics of
// its own today; any it did raise would be hard errors.
func buildNameof(prog *driver.Program, ctx *tokens.Context, env *stageEnv, emit diagnosticSink) plugin.FileTransform {
	return nameoftransform.New(prog, ctx, env.artifacts, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

// buildDi activates the registration lowering stage. It is category-aware: a
// ditransform advisory Warning is reported without failing emit, matching the
// reference transformer where only hard errors gate the build.
func buildDi(prog *driver.Program, ctx *tokens.Context, _ *stageEnv, emit diagnosticSink) plugin.FileTransform {
	transform := ditransform.New(prog, ctx, func(d ditransform.Diagnostic) {
		emit(envelopeFromDi(d))
	})
	return plugin.FileTransform(transform)
}

// buildDiOptions activates the addOptions<T>() sugar lowering stage. Every
// diagnostic it raises is a hard error.
func buildDiOptions(prog *driver.Program, ctx *tokens.Context, _ *stageEnv, emit diagnosticSink) plugin.FileTransform {
	return dioptionstransform.AddOptionsTransform(prog, ctx, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

// buildConfig activates the withType->withSchema lowering stage. Every
// diagnostic it raises is a hard error.
func buildConfig(prog *driver.Program, ctx *tokens.Context, _ *stageEnv, emit diagnosticSink) plugin.FileTransform {
	return configtransform.New(prog, ctx, func(d plugin.Diagnostic) {
		emit(envelopeFromPlugin(d, categoryError))
	})
}

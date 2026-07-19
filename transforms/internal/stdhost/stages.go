package stdhost

import (
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/dioptionstransform"
	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/nameoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/tokens"
)

// stagePrefix marks a manifest entry as one of a host's own stages. A
// descriptor name carrying it (e.g. "rhombusstd_nameof") selects the matching
// FileTransform; a prefixed name with no matching stage is a hard UNKNOWN_STAGE
// error, and a NON-prefixed entry is a foreign plugin handled by the linked
// machinery (or rejected when it is not linked) — see host.go.
const stagePrefix = "rhombusstd_"

// StageName returns the manifest descriptor name for a bare stage id
// ("nameof" -> "rhombusstd_nameof"), so a sibling host composes extra stages
// without restating the prefix convention.
func StageName(id string) string {
	return stagePrefix + id
}

// BaseStages is the fixed execution order every activated base stage runs in:
// inline first (so single-expression sugar bodies are substituted before any
// primitive stage runs), then nameof (its token lowering and import elision,
// including the inline stage's synthetic nameof calls), then signatureof (the
// dependency-signature array lowering, including the inline stage's synthetic
// signatureof calls), then the registration verbs, the addOptions sugar, and the
// config schema lowering. signatureof runs after nameof (disjoint call shapes —
// a type-argument vs a value-argument primitive) and before di, so the di stage
// sees a fully-lowered 3-argument `add(...)` it leaves untouched. Manifest entry
// order does not affect this — selection filters the host's stage slice,
// preserving order.
//
// Returned as a fresh slice so a sibling host (cmd/ttsc-std-full) can splice
// its extra stages in without mutating shared state.
func BaseStages() []Stage {
	return []Stage{
		{Name: stagePrefix + "inline", Build: buildInline},
		{Name: stagePrefix + "nameof", Build: buildNameof},
		{Name: stagePrefix + "signatureof", Build: buildSignatureof},
		{Name: stagePrefix + "di", Build: buildDi},
		{Name: stagePrefix + "di_options", Build: buildDiOptions},
		{Name: stagePrefix + "config", Build: buildConfig},
	}
}

// BaseBundles maps a PRESET descriptor name to the ordered set of stage names it
// expands into. A bundle lets a library declare its primitive-stage "package" once
// (di.core's `add<T>()` / `addFactory<T>()` sugar needs inline -> nameof ->
// signatureof -> di) so a consumer wires ONE transform instead of enumerating the
// four in the right order: selectStages replaces a bundle name with its
// constituents, which the host's stage table then sorts and dedups. The single
// owner binary owns both the membership AND the order, so no consumer ever
// hand-lists the primitive stages — the whole point of the preset. Discovery
// (stock ttsc's marker -> single transform string) is untouched: the one string
// a bundle descriptor yields resolves to a name WE choose here, and expansion
// is ours.
func BaseBundles() map[string][]string {
	return map[string][]string{
		stagePrefix + "di_bundle": {
			stagePrefix + "inline",
			stagePrefix + "nameof",
			stagePrefix + "signatureof",
			stagePrefix + "di",
		},
	}
}

// buildInline activates the generic single-expression inline stage. It collects
// the workspace publish list, substitutes matched sugar bodies, and registers
// the synthetic primitive calls the nameof stage lowers. Every diagnostic it
// raises is a hard error.
func buildInline(prog *driver.Program, _ *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return inlinetransform.Build(prog, env.Cwd, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildNameof activates the nameof lowering stage. It raises no diagnostics of
// its own today; any it did raise would be hard errors.
func buildNameof(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return nameoftransform.New(prog, ctx, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildSignatureof activates the signatureof primitive stage. It shares
// ditransform's extraction path, so it is category-aware the same way buildDi is:
// a §4.5 advisory Warning is reported without failing emit, matching what the di
// stage would emit for the same value.
func buildSignatureof(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return signaturetransform.New(prog, ctx, env.Artifacts, func(d ditransform.Diagnostic) {
		emit(DiagFromDi(d))
	})
}

// buildDi activates the registration lowering stage. It is category-aware: a
// ditransform advisory Warning is reported without failing emit, matching the
// reference transformer where only hard errors gate the build.
func buildDi(prog *driver.Program, ctx *tokens.Context, _ *Env, emit Sink) plugin.FileTransform {
	transform := ditransform.New(prog, ctx, func(d ditransform.Diagnostic) {
		emit(DiagFromDi(d))
	})
	return plugin.FileTransform(transform)
}

// buildDiOptions activates the addOptions<T>() sugar lowering stage. Every
// diagnostic it raises is a hard error.
func buildDiOptions(prog *driver.Program, ctx *tokens.Context, _ *Env, emit Sink) plugin.FileTransform {
	return dioptionstransform.AddOptionsTransform(prog, ctx, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildConfig activates the withType->withSchema lowering stage. Every
// diagnostic it raises is a hard error.
func buildConfig(prog *driver.Program, ctx *tokens.Context, _ *Env, emit Sink) plugin.FileTransform {
	return configtransform.New(prog, ctx, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

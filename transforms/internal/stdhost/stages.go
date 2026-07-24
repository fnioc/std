package stdhost

import (
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/dioptionstransform"
	"github.com/fnioc/std/transforms/internal/ditransform"
	"github.com/fnioc/std/transforms/internal/foldtransform"
	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/mergesynthtransform"
	"github.com/fnioc/std/transforms/internal/nameoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/singulartransform"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/valueoftransform"
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
// primitive stage runs), then mergesynth (it reads the ORIGINAL augmentation
// member declarations through the checker and threads a plain-JS merge-strategies
// object as the third argument of each registerAugmentations/applyAugmentations
// call — it runs before nameof so nameof still lowers the call's token argument,
// and later stages leave the synthesized object untouched), then nameof (its
// token lowering and import elision, including the inline stage's synthetic
// nameof calls), then signatureof (the dependency-signature array lowering — the
// value-argument `signatureof(ctor)` AND its type-argument minting siblings
// `signaturefor<T>()` / `signaturesfor<T>()`, including the inline stage's
// synthetic calls), then keyof (the keyed-registration KEY lowering, including
// the inline stage's synthetic keyof calls), then valueof (the literal-value
// lowering of `valueof<Scope>()` — the `.as<Scope>()` sugar's scope half), then
// the registration verbs, the addOptions sugar, and the config schema lowering.
// signatureof, keyof, and valueof all run after nameof (disjoint call shapes) and
// before di, so the di stage sees a fully-lowered `add(...)` / `.as("x")` it
// leaves untouched. Manifest entry order does not affect this — selection filters
// the host's stage slice, preserving order.
//
// Returned as a fresh slice each call so selection can filter it without
// mutating shared state.
func BaseStages() []Stage {
	return []Stage{
		{Name: stagePrefix + "inline", Build: buildInline},
		{Name: stagePrefix + "mergesynth", Build: buildMergesynth},
		{Name: stagePrefix + "nameof", Build: buildNameof},
		{Name: stagePrefix + "signatureof", Build: buildSignatureof},
		{Name: stagePrefix + "keyof", Build: buildKeyof},
		{Name: stagePrefix + "valueof", Build: buildValueof},
		{Name: stagePrefix + "singular", Build: buildSingular},
		{Name: stagePrefix + "fold", Build: buildFold},
		{Name: stagePrefix + "di", Build: buildDi},
		{Name: stagePrefix + "di_options", Build: buildDiOptions},
		{Name: stagePrefix + "config", Build: buildConfig},
	}
}

// BaseBundles maps a PRESET descriptor name to the ordered set of stage names it
// expands into. A bundle lets a library declare its primitive-stage "package" once
// (di.core's `add<T>()` / `addFactory<T>()` sugar needs inline -> nameof ->
// signatureof -> keyof -> di) so a consumer wires ONE transform instead of
// enumerating them in the right order: selectStages replaces a bundle name with its
// constituents, which the host's stage table then sorts and dedups. The single
// owner binary owns both the membership AND the order, so no consumer ever
// hand-lists the primitive stages — the whole point of the preset. Discovery
// (stock ttsc's marker -> single transform string) is untouched: the one string
// a bundle descriptor yields resolves to a name WE choose here, and expansion
// is ours.
//
// Bundles are the EXPLICIT opt-in channel (di.core's `./ttsc`); the default path
// needs none — the host self-selects the full stage union from its own dependency
// scan (§100 declare-by-depending, see runTransform), not from a bundle name.
func BaseBundles() map[string][]string {
	return map[string][]string{
		stagePrefix + "di_bundle": {
			stagePrefix + "inline",
			stagePrefix + "nameof",
			stagePrefix + "signatureof",
			stagePrefix + "keyof",
			stagePrefix + "valueof",
			stagePrefix + "singular",
			stagePrefix + "fold",
			stagePrefix + "di",
		},
	}
}

// buildInline activates the generic single-expression inline stage. It collects
// the workspace publish list, substitutes matched sugar bodies, and registers
// the synthetic primitive calls the nameof stage lowers. Every diagnostic it
// raises is a hard error.
func buildInline(prog *driver.Program, _ *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return inlinetransform.Build(prog, env.Bodies, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildMergesynth activates the merge-strategy synthesizer (#213). The host runs
// it as a ONE-SHOT PRE-PASS, once per file BEFORE the fixed-point loop (Open issue
// 2, see transformFileToTypeScript): it is augmentation-side and its matches are
// only ever source-written installs, so the loop can never mint fresh work for it.
// It stays ahead of the loop's nameof pass, so nameof still lowers each install
// call's token argument. It reads the ORIGINAL augmentation member
// declarations through the checker and threads a plain-JS strategies object as
// the third argument of each registerAugmentations/applyAugmentations call, so a
// member-name collision dispatches by argument shape instead of throwing. The
// synthesized guards are inlined plain JS (the typia embed is fully lowered at
// build time — no typia runtime import survives). It is category-aware like the
// di stage: an advisory warning (a dropped guard that would have needed a typia
// runtime helper) never fails the emit.
func buildMergesynth(prog *driver.Program, _ *tokens.Context, _ *Env, emit Sink) plugin.FileTransform {
	return mergesynthtransform.New(prog, func(d mergesynthtransform.Diagnostic) {
		emit(Diag{
			File:    d.File,
			Warning: d.Category == mergesynthtransform.Warning,
			Code:    d.Code,
			Message: d.Message,
		})
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

// buildKeyof activates the keyof primitive stage. It lowers each `keyof<T>()` —
// the inline stage's synthetic keyed-registration KEY calls and any source-written
// one — to the `Keyed<T, K>` key string (or `void 0` when unkeyed). It raises no
// diagnostics of its own; any it did raise would be hard errors.
func buildKeyof(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return keyoftransform.New(prog, ctx, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildValueof activates the valueof primitive stage. It lowers each
// `valueof<Scope>()` — the inline stage's synthetic `.as<Scope>()` scope call and
// any source-written one — to the scope's literal value expression. It raises no
// diagnostics of its own; any it did raise would be hard errors.
func buildValueof(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return valueoftransform.New(prog, ctx, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildSingular activates the resolve-family SINGULAR predicate/value primitive
// stage (§94). It lowers each `isSingular<T>()` — the inline resolve body's
// compile-time singular-type test — to a boolean literal, and each
// `singularValue<T>()` over a singular T to that type's value literal (leaving a
// non-singular one un-lowered for the fold to prune or the sweep to flag). It runs
// after the token/keyof/valueof primitives and before the fold, whose
// boolean-ternary pruning consumes the `isSingular` literals it produces. It
// raises no diagnostics of its own.
func buildSingular(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return singulartransform.New(prog, ctx, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildFold activates the generic constant-fold / dead-branch-prune stage. It is
// a domain-agnostic AST simplification: a conditional (ternary) expression whose
// condition is a boolean literal folds to the taken branch (`true ? A : B` -> A,
// `false ? A : B` -> B), so a dead branch's primitives are removed before the emit
// sweep sees them. It runs after the singular stage produces the boolean-literal
// conditions the resolve sugar branches on. It raises no diagnostics of its own.
func buildFold(prog *driver.Program, _ *tokens.Context, _ *Env, emit Sink) plugin.FileTransform {
	return foldtransform.New(prog, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
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

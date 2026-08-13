package stdhost

import (
	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/inlinetransform"
	"github.com/fnioc/std/transforms/internal/keyoftransform"
	"github.com/fnioc/std/transforms/internal/mergesynthtransform"
	"github.com/fnioc/std/transforms/internal/nameoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/schemaoftransform"
	"github.com/fnioc/std/transforms/internal/signatures"
	"github.com/fnioc/std/transforms/internal/signaturetransform"
	"github.com/fnioc/std/transforms/internal/tokens"
	"github.com/fnioc/std/transforms/internal/typefortransform"
)

// stagePrefix namespaces each stage's internal name (e.g. "rhombusstd_nameof").
// The names are host-internal identifiers now — used to single out mergesynth for
// the pre-pass split (partitionStages) and to label diagnostics — not selectors:
// the whole stage table always runs (W7).
const stagePrefix = "rhombusstd_"

// BaseStages is the fixed execution order every base stage runs in. There is no
// selection — the host runs this whole table on every file (W7); a stage that
// matches nothing is a cheap no-op (disjoint match sets).
// Every stage is now a DOMAIN-AGNOSTIC primitive: the bespoke di / di_options /
// config registration stages were deleted (W6p3), their authoring forms
// re-expressed as inline sugar bodies the primitives lower under the fixed-point
// loop. Order:
//
// inline first (so single-expression sugar bodies are substituted before any
// primitive stage runs), then mergesynth (it reads the ORIGINAL augmentation
// member declarations through the checker and threads a plain-JS merge-strategies
// object as the third argument of each registerAugmentations/applyAugmentations
// call — it runs before nameof so nameof still lowers the call's token argument,
// and later stages leave the synthesized object untouched), then nameof (its
// token lowering and import elision, including the inline stage's synthetic
// nameof calls), then typefor (the structured `Type.*` lowering of
// `typefor<T>()` / `typefor(value)` — the runtime-`Type` sibling of nameof's flat
// string token, disjoint from it by callee), then signatureof (the
// dependency-signature array lowering — the value-argument `signatureof(ctor)`
// AND its type-argument minting siblings `signaturefor<T>()` /
// `signaturesfor<T>()`, including the inline stage's synthetic calls), then keyof
// (the keyed-registration KEY lowering, including the inline stage's synthetic
// keyof calls), then schemaof (the config `.withType<T>()` sugar's
// schema-literal lowering). All stages own DISJOINT match sets, so correctness
// never depends on this order — it is fixed only for reproducible output.
//
// Returned as a fresh slice each call so a caller can reorder or extend it
// without mutating shared state.
func BaseStages() []Stage {
	return []Stage{
		{Name: stagePrefix + "inline", Build: buildInline},
		{Name: stagePrefix + "mergesynth", Build: buildMergesynth},
		{Name: stagePrefix + "nameof", Build: buildNameof},
		{Name: stagePrefix + "typefor", Build: buildTypefor},
		{Name: stagePrefix + "signatureof", Build: buildSignatureof},
		{Name: stagePrefix + "keyof", Build: buildKeyof},
		{Name: stagePrefix + "schemaof", Build: buildSchemaof},
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

// buildTypefor activates the typefor primitive stage. It lowers each
// `typefor<T>()` / `typefor(value)` to the `Type.*` factory tree its argument
// derives, folding an immediate known-accessor property access (`.instanceType`,
// `.returnType`, `.args`, `.value`, `.tag`, `.type`, `.kind`) through to the
// surviving sub-tree. It raises no diagnostics of its own; any it did raise
// would be hard errors.
func buildTypefor(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return typefortransform.New(prog, ctx, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

// buildSignatureof activates the signatureof primitive stage. It drives the
// shared signatures extraction engine, so it is category-aware: a §4.5 advisory
// Warning is reported without failing emit (only hard errors gate the build),
// matching what a hand-written registration would carry for the same value.
func buildSignatureof(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return signaturetransform.New(prog, ctx, env.Artifacts, func(d signatures.Diagnostic) {
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

// buildSchemaof activates the generic `schemaof<T>()` primitive stage. It lowers
// each schemaof call — the inline `.withType<T>()` body's synthetic schema call
// and any source-written one — to T's runtime config-schema object literal,
// materializing the OPTIONAL value-import a wrapped field needs. It runs the SAME
// schema walk the config stage drives, so the inline path and the config-stage
// oracle emit byte-identical literals. On an unsupported field type / non-object
// root it reports the targeted 992001/992002 (a hard error) and leaves the call
// un-lowered — the sweep defers the surviving-primitive diagnostic to it.
func buildSchemaof(prog *driver.Program, ctx *tokens.Context, env *Env, emit Sink) plugin.FileTransform {
	return schemaoftransform.New(prog, ctx, env.Artifacts, func(d plugin.Diagnostic) {
		emit(DiagFromPlugin(d))
	})
}

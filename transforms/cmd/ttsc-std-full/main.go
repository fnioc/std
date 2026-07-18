// Command ttsc-std-full is the IN-REPO-ONLY sibling of ttsc-std: the same
// scaffolding and base stage table, plus the typia-embedding merge-synthesis
// stage (#213, decisions.v2 §87). Augmentation authoring is first-party-only,
// so the one audience that ever needs merge synthesis is this repo's own
// library build — published @rhombus-std/*.transformer descriptors keep
// resolving to the typia-free ttsc-std, while the repo-local full-variant
// descriptors (primitives.transformer's `./full-ttsc` + `./mergesynth-ttsc`,
// excluded from the published manifest) resolve here. ttsc keys its plugin
// cache on the descriptor's source directory, so the two hosts build as two
// distinct sidecars and a consumer's plugin list must resolve wholly to one or
// the other — never a mix.
//
// Module layout (the §87 "keep typia out of the published graph" split): both
// commands live in the ONE transforms module, whose go.mod records the typia
// native requirement — a separate module for this command cannot work, because
// ttsc's plugin builder scratch-copies exactly one module directory, which
// would sever a nested module's path back to the shared internal/ stages. The
// single-module shape still keeps the published host typia-clean: only this
// command's import graph reaches typia (`go list -deps ./cmd/ttsc-std` names
// zero typia packages), so building ttsc-std links no typia code and fetches
// no typia source — the module graph reads only typia's go.mod metadata, a
// one-time ~2KB proxy fetch beside the typescript-go module every cold
// source-plugin build already fetches; warm module caches build offline as
// before. typia itself appears in no npm manifest; it is fully lowered at
// build time and the merge-synthesis stage drops any guard that would need a
// typia runtime helper import.
//
// Canonical order: the merge-synthesis stage runs after inline and before
// nameof — it reads the ORIGINAL member declarations through the checker and
// threads a plain-JS strategies object, which later stages leave untouched;
// the registration call's other arguments (the nameof token among them) are
// preserved as original nodes for those stages' own visits.
package main

import (
	"os"

	"github.com/samchon/ttsc/packages/ttsc/driver"

	"github.com/fnioc/std/transforms/internal/mergesynthtransform"
	"github.com/fnioc/std/transforms/internal/plugin"
	"github.com/fnioc/std/transforms/internal/stdhost"
	"github.com/fnioc/std/transforms/internal/tokens"
)

func main() {
	host := stdhost.Host{
		Name:    "ttsc-std-full",
		Stages:  fullStages(),
		Bundles: stdhost.BaseBundles(),
	}
	os.Exit(stdhost.Run(host, os.Args[1:]))
}

// fullStages splices the merge-synthesis stage into the base canonical order,
// directly before nameof (see the package comment for why that slot).
func fullStages() []stdhost.Stage {
	base := stdhost.BaseStages()
	merged := make([]stdhost.Stage, 0, len(base)+1)
	for _, stage := range base {
		if stage.Name == stdhost.StageName("nameof") {
			merged = append(merged, stdhost.Stage{Name: stdhost.StageName("mergesynth"), Build: buildMergesynth})
		}
		merged = append(merged, stage)
	}
	return merged
}

// buildMergesynth activates the merge-strategy synthesizer. It is
// category-aware like the di stage: its advisory warnings (a dropped guard
// that would have needed a typia runtime import) never fail the emit.
func buildMergesynth(prog *driver.Program, _ *tokens.Context, _ *stdhost.Env, emit stdhost.Sink) plugin.FileTransform {
	return mergesynthtransform.New(prog, func(d mergesynthtransform.Diagnostic) {
		emit(stdhost.Diag{
			File:    d.File,
			Warning: d.Category == mergesynthtransform.Warning,
			Code:    d.Code,
			Message: d.Message,
		})
	})
}

// Command ttsc-std is the single owner ttsc transform-stage host for the whole
// @rhombus-std transform stack. Every published @rhombus-std/*.transformer ttsc
// descriptor resolves to THIS Go package, so ttsc dedupes them to one cache key
// and one spawn, then hands the full plugin list to this binary via
// --plugins-json. The host reads that manifest, activates ONLY the stages the
// consumer declared (runtime selection by descriptor name), and runs them
// back-to-back over one loaded program in one shared EmitContext, in the
// hardcoded canonical order
//
//	inline -> mergesynth -> nameof -> signatureof -> keyof -> di -> di-options -> config
//
// Entry order in the manifest is irrelevant; the canonical order is fixed. This
// replaces the former per-combination sidecars (ttsc-nameof / ttsc-di /
// ttsc-di-options / ttsc-di-app / ttsc-config): one binary, many declared
// stages, selected at runtime.
//
// The scaffolding lives in internal/stdhost. This is the ONE host: it links
// typia through the merge-synthesis stage (#213), which the base stage table
// carries — the former in-repo-only cmd/ttsc-std-full sibling is retired. typia
// is fully lowered at build time (the stage embeds its guards as inlined plain
// JS) and rides in no shipped artifact or npm manifest, so this stays a
// build-time-only plugin binary; the measured cost of linking it is +4.4 MB /
// +17.6% on the compiled sidecar, accepted for the one-host simplification.
package main

import (
	"os"

	"github.com/fnioc/std/transforms/internal/stdhost"
)

func main() {
	host := stdhost.Host{
		Name:    "ttsc-std",
		Stages:  stdhost.BaseStages(),
		Bundles: stdhost.BaseBundles(),
	}
	os.Exit(stdhost.Run(host, os.Args[1:]))
}

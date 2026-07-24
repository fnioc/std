// Command ttsc-std is the single owner ttsc transform-stage host for the whole
// @rhombus-std transform stack. Every published @rhombus-std/*.extras ttsc
// descriptor resolves to THIS Go package, so ttsc dedupes them to one cache key
// and one spawn. There is no stage selection (W7): the host runs its WHOLE stage
// table back-to-back over one loaded program in one shared EmitContext, in the
// hardcoded canonical order
//
//	inline -> mergesynth -> nameof -> signatureof -> keyof -> valueof ->
//	singular -> factory -> fold -> schemaof
//
// A stage that matches nothing in the program is a cheap no-op (the stages own
// disjoint match sets), so always-on is correct as well as simple. This replaces
// the former per-combination sidecars (ttsc-nameof / ttsc-di / ttsc-di-options /
// ttsc-di-app / ttsc-config) AND the interim single-binary-with-selection design:
// one binary, one always-on set.
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
		Name:   "ttsc-std",
		Stages: stdhost.BaseStages(),
	}
	os.Exit(stdhost.Run(host, os.Args[1:]))
}

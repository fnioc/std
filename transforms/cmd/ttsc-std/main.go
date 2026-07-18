// Command ttsc-std is the single owner ttsc transform-stage host for the whole
// @rhombus-std transform stack. Every published @rhombus-std/*.transformer ttsc
// descriptor resolves to THIS Go package, so ttsc dedupes them to one cache key
// and one spawn, then hands the full plugin list to this binary via
// --plugins-json. The host reads that manifest, activates ONLY the stages the
// consumer declared (runtime selection by descriptor name), and runs them
// back-to-back over one loaded program in one shared EmitContext, in the
// hardcoded canonical order
//
//	inline -> nameof -> signatureof -> di -> di-options -> config
//
// Entry order in the manifest is irrelevant; the canonical order is fixed. This
// replaces the former per-combination sidecars (ttsc-nameof / ttsc-di /
// ttsc-di-options / ttsc-di-app / ttsc-config): one binary, many declared
// stages, selected at runtime.
//
// The scaffolding lives in internal/stdhost, shared with the in-repo-only
// cmd/ttsc-std-full sibling (which adds the typia-embedding merge-synthesis
// stage). THIS binary is the published one and stays typia-free (§87): it
// links zero typia packages (`go list -deps ./cmd/ttsc-std` names none), so
// building it never fetches typia source — module-graph resolution reads only
// typia's go.mod metadata (a one-time ~2KB proxy fetch, cached alongside the
// typescript-go module every cold source-plugin build already fetches; warm
// module caches build offline exactly as before).
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

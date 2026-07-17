// Command ttsc-std is the single owner ttsc transform-stage host for the whole
// @rhombus-std transform stack. Every @rhombus-std/*.transformer ttsc descriptor
// resolves to THIS Go package, so ttsc dedupes them to one cache key and one
// spawn, then hands the full plugin list to this binary via --plugins-json. The
// host reads that manifest, activates ONLY the stages the consumer declared
// (runtime selection by descriptor name), and runs them back-to-back over one
// loaded program in one shared EmitContext, in the hardcoded canonical order
//
//	nameof -> di -> di-options -> config
//
// Entry order in the manifest is irrelevant; the canonical order is fixed. This
// replaces the former per-combination sidecars (ttsc-nameof / ttsc-di /
// ttsc-di-options / ttsc-di-app / ttsc-config): one binary, many declared
// stages, selected at runtime.
package main

import (
	"os"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

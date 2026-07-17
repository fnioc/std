// Command ttsc-nameof is the ttsc transform-stage sidecar that lowers
// `nameof<T>()` calls to their derived string token at compile time — the Go port
// of the hand-written TypeScript nameof transformer. It is an executable the ttsc
// host lazily builds with the local Go toolchain and drives over stdio.
package main

import (
	"os"

	"github.com/fnioc/std/transforms/internal/nameoftransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

func main() {
	os.Exit(plugin.Run(plugin.Spec{
		Name:    "ttsc-nameof",
		Factory: nameoftransform.New,
	}, os.Args[1:]))
}

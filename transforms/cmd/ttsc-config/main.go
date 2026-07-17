// Command ttsc-config is the ttsc transform-stage sidecar that lowers
// `<builder>.withType<T>()` calls into a generated `<builder>.withSchema({...})`
// runtime schema literal at compile time — the Go port of the hand-written
// TypeScript config transformer. It is an executable the ttsc host lazily builds
// with the local Go toolchain and drives over stdio.
package main

import (
	"os"

	"github.com/fnioc/std/transforms/internal/configtransform"
	"github.com/fnioc/std/transforms/internal/plugin"
)

func main() {
	os.Exit(plugin.Run(plugin.Spec{
		Name:    "ttsc-config",
		Factory: configtransform.New,
	}, os.Args[1:]))
}

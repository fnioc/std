// Command ttsc-di-options is the ttsc transform-stage sidecar that lowers the
// type-driven `addOptions<T>()` sugar on a registration builder to the explicit
// verb `addOptions(token(Options<T>), token(T))` at compile time — the Go port of
// the hand-written TypeScript options-sugar transformer. It is a satellite of the
// registration transformer: it reuses the shared token-derivation core so the
// tokens it emits are byte-identical, and it emits only registration tokens.
//
// The ttsc host lazily builds this executable with the local Go toolchain and
// drives it over stdio; the shared sidecar scaffolding owns the protocol.
package main

import (
	"os"

	"github.com/fnioc/std/transforms/internal/plugin"
)

func main() {
	os.Exit(plugin.Run(plugin.Spec{
		Name:    "ttsc-di-options",
		Factory: addOptionsTransform,
	}, os.Args[1:]))
}

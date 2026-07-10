// Command ttsc-di is the ttsc transform-stage sidecar that lowers the registration
// authoring forms (`add<I>(C)`, `.as<"x">()`, tokenless `resolve<I>()` /
// `isService<I>()`, `nameof<T>()`) to their string-token runtime forms, carrying
// each derived dependency signature inline — the Go port of the hand-written
// TypeScript registration transformer. It is an executable the ttsc host lazily
// builds with the local Go toolchain and drives over stdio.
package main

import (
	"os"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

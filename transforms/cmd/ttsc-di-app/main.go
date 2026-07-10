// Command ttsc-di-app is the aggregate ttsc transform-stage sidecar that composes
// BOTH the registration lowering (add/resolve/isService/nameof) and the
// addOptions<T>() sugar lowering in ONE native host, over ONE loaded program.
//
// ttsc runs a single native backend per source-to-source pass, so a consumer that
// needs both the registration transform and its options satellite cannot list two
// separate plugins — it wires this one aggregate instead. Both stages reuse the
// same shared token-derivation core, so every token this host emits is identical
// to what the two standalone sidecars (cmd/ttsc-di, cmd/ttsc-di-options) produce;
// this host only runs them back-to-back on each file in one program load.
package main

import (
	"os"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

# @rhombus-std/primitives

The change-token primitives ported from `ME.Primitives` --
`IChangeToken`, `ChangeToken.onChange`, `CancellationChangeToken`. A leaf
package: zero dependencies, the analog of ME's Primitives that everything
reload-capable (config live-reload, options monitors, #6) builds on.

## Install

```sh
npm install @rhombus-std/primitives
```

## Basic usage

```ts
import { CancellationChangeToken, ChangeToken } from "@rhombus-std/primitives";

let controller = new AbortController();

const disposable = ChangeToken.onChange(
  () => new CancellationChangeToken(controller.signal),
  () => console.log("changed"),
);

controller.abort(); // logs "changed"
disposable[Symbol.dispose]();
```

`ChangeToken.onChange` re-subscribes on every fire, so `produceToken` should
hand back a token representing the *next* change window each time it's
called -- a `CancellationChangeToken` wrapping a stale, already-aborted
signal will keep firing synchronously.

## CancellationChangeToken vs. the reference runtime's CancellationToken

ME backs `CancellationChangeToken` with a `CancellationToken`; there's no
equivalent in TS, so this port backs it with the idiomatic web-platform
primitive instead -- `AbortSignal`. `hasChanged` mirrors
`IsCancellationRequested` as `signal.aborted`. Unlike `CancellationToken.None`,
a plain `AbortSignal` always supports listeners, so `activeChangeCallbacks` is
unconditionally `true`.

## Not yet ported

`StringValues`/`StringSegment` -- the other half of ME's Primitives -- aren't
here yet. They land in a later PR once config/http need them.

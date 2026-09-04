# di engine features

What the resolution engine in `@rhombus-std/di` does on its own, before any addon is installed.
Lifetime models, validation and everything else that rides on hooks lives in the addons; this page
is the engine.

1. **Decorator pattern (shadow)** — a registration whose slot names its own address is handed the
   registration beneath it, so a newer registration wraps the older one instead of replacing it.
2. **Collections** — an `Iterable<T>` or `T[]` ask answers with every registration of `T`, in the
   order they were authored, fresh on every ask.
3. **Compositional types** — a slot can be an object, a tuple, a union or an optional; the engine
   composes the value from the registrations its parts name, and an optional part missing from the
   manifest arrives as `undefined`.
4. **Async** — a `Promise<T>` ask is a boundary: everything awaited beneath it settles together, and a
   slot asking for `T` is served by a registered `Promise<T>` when it sits inside one.
5. **Latebound** — arguments passed at the ask are slots the manifest never sees.
   - **Overrides** — a passed argument outranks a registration of the same address.
   - **Non-registered provides** — a passed argument supplies an address nothing registers.
6. **Instantiator/invoker** — a `Ctor` or `Func` address is answered with a callable whose slots are
   resolved on invocation, so construction and calls can be handed out as services.
7. **Starfish/hooks** — every ask travels as a request through a chain of hooks that addons install:
   before plan, begin resolve, before construct, canonicalize, after construct.
8. **Tagged** — a tag on an address makes it a distinct address, so one type can be registered and
   asked for under several names.
9. **Open generics (with advanced mappings)** — a registration can leave type arguments open; an ask
   binds them, and the registration's slots may map the bound arguments into other types.

Feature docs: [async resolution](async-resolution.md).

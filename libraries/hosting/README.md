# @rhombus-std/hosting

Skeleton for the Generic Host port (`ME.Hosting`). `IHostBuilder` is the
primary API surface, matching the upstream builder-first shape; `HostBuilder`/`Host` here are
stubs -- every `HostBuilder` method throws `not implemented`.

## Status

The real port wires `HostBuilder` up to `@rhombus-std/di` (service registration, via its
compile-time transformer) and `@rhombus-std/config` (host configuration). That's a later
increment -- this package intentionally stays self-contained, depending only on
`@rhombus-std/hosting.core` for now.

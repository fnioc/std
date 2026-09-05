import type { Type } from '@rhombus-std/primitives';

/**
 * A same-length tuple of dependency types, one per entry in `Deps` -- the
 * type list a DI-injected pipeline step (the `configure`/`postConfigure`/
 * `validate` dependency forms) resolves from the provider before invoking its
 * callback. A typed caller writes `[typefor<Dep1>(), typefor<Dep2>()]`.
 */
export type DepTypes<Deps extends readonly unknown[]> = { [K in keyof Deps]: Type; } & Type[];

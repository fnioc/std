import type { Token } from '@rhombus-std/di.core';

/**
 * A same-length tuple of dependency-token strings, one per entry in `Deps` -- the
 * token list a DI-injected pipeline step (the `configure`/`postConfigure`/
 * `validate` dependency forms) resolves from the provider before invoking its
 * callback. A typed caller writes `[tokenfor<Dep1>(), tokenfor<Dep2>()]`.
 */
export type DepTokens<Deps extends readonly unknown[]> = { [K in keyof Deps]: Token; };

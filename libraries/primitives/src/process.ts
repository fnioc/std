// Owned `process` typing -- the §39 recipe (see ./abort.ts) extended to the
// process global: library programs carry zero ambient platform types, so the
// packages that touch the process (config.env, config.json, hosting,
// logging.console) import this typed re-export from the zero-dep leaf instead
// of naming an ambient global only @types/node could supply.
//
// `ProcessLike` is exactly the member set this repo calls -- `env`, `cwd`,
// `stdout.write`, the signal `on`/`off` pair -- not a platform-complete
// surface; extend it when a consumer actually calls something new. One-way
// assignability is all that is required (platform process -> ProcessLike; we
// never hand ours back to a platform API), asserted by a type test in
// tests/primitives.test.

export interface ProcessLike {
  readonly env: Record<string, string | undefined>;
  cwd(): string;
  readonly stdout: { write(chunk: string): boolean };
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

/**
 * The platform `process` global, re-typed against {@link ProcessLike}. No
 * runtime fallback -- node/bun/deno all supply it.
 */
export const process: ProcessLike = (globalThis as unknown as { process: ProcessLike }).process;

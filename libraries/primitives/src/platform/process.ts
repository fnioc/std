// Owned `process` typing (like ./abort.ts): a typed re-export off `globalThis`
// so libraries can touch the process without an ambient platform type only
// @types/node would supply. `ProcessLike` covers only the members this repo
// calls — extend it when a consumer needs another.

import type { Func } from '@rhombus-toolkit/func';

export interface ProcessLike {
  readonly env: Record<string, string | undefined>;
  cwd(): string;
  readonly stdout: { write(chunk: string): boolean; };
  on(event: string, listener: Func<[], void>): unknown;
  off(event: string, listener: Func<[], void>): unknown;
}

/**
 * The platform `process` global, re-typed against {@link ProcessLike}. No
 * runtime fallback -- node/bun/deno all supply it.
 */
export const process: ProcessLike = (globalThis as unknown as { process: ProcessLike; }).process;

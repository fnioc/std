import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/**
 * The container's one request-grain pipeline type: what `use()` composes around the engine, and
 * what an addon's own contribution rides too.
 *
 * @remarks
 * The chain composes once, at build: a factory runs exactly once, and may do install-time work of
 * its own there — planting a permanent hook, sweeping the manifest — resolving through `next`
 * whatever that work needs, which resolves at build time. The function it answers is what each
 * request runs through from then on.
 *
 * One traversal serves one ask, and everything reached through `next` belongs to it: a request
 * substituted for the one that arrived, or resolved beside it, is answered in that ask's context —
 * its scope, and whatever its asker put under it — exactly as the ask itself would be. Middleware
 * wanting a resolution of its own asks a provider instead, injected or closed over, which opens an
 * ask of its own. A `next` held onto and called after its traversal has answered belongs to no ask
 * at all, and resolves under nothing.
 */
export type Middleware = Func<[next: Func<[request: Type], unknown>], Func<[request: Type], unknown>>;

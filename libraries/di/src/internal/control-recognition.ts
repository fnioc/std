import { Control, type IServiceProvider, type Request, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { type T, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

/**
 * Whether `address` is a control ask at all, whatever that ask asks for.
 *
 * @remarks
 * An address still carrying a hole is nobody's control ask, and it reaches here on its way to the
 * refusal the engine owes it — so it answers `false` rather than being matched against.
 */
export function isControlAsk(address: Type): boolean {
  return Type.isClosed(address) && Type.isMatch(typefor<Control<T>>(), address);
}

/**
 * What a control ask for `address` through `resolve` answers with.
 *
 * @remarks
 * At fold time, no real provider exists yet; the request constructed here carries no meaningful
 * `serviceProvider` — control asks never read it.
 *
 * @throws {UnsatisfiableError} when the answer is not a control — a middleware standing in the way
 * answered the ask itself.
 */
export function askForControl<Service>(resolve: Func<[Request], unknown>, address: Type): Service {
  const answer: unknown = resolve({ type: address, serviceProvider: undefined as unknown as IServiceProvider });
  if (!(answer instanceof Control)) {
    throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than a control');
  }
  return answer.service as Service;
}

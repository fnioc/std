import { Control, type IServiceProvider, type T, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/** Whether `address` is a control ask at all, whatever that ask asks for. */
export function isControlAsk(address: Type): boolean {
  const [isMatch] = Type.bindGenerics(typefor<Control<T>>(), address);
  return isMatch;
}

/**
 * What a control ask for `address` through `provider` answers with.
 *
 * @throws {UnsatisfiableError} when the answer is not a control — a middleware standing in the way
 * answered the ask itself.
 */
export function askForControl<Service>(provider: Pick<IServiceProvider, 'getService'>, address: Type): Service {
  const answer: unknown = provider.getService(address);
  if (!(answer instanceof Control)) {
    throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than a control');
  }
  return answer.service as Service;
}

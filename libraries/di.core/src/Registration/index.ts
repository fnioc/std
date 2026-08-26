import * as factories from './factories';
import * as op from './op';
import type { Registration as RegistrationType } from './Registration';

export type { CtorRegistration, FactoryRegistration, ValueRegistration } from './Registration';

export type Registration<Lifetime> = RegistrationType<Lifetime>;

/** The registration constructors and the operations over them, under the name of the type itself. */
export const Registration: typeof factories & typeof op = { ...factories, ...op };

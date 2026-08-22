import * as factories from './factories';
import * as op from './op';
import type { ServiceDescriptor as Descriptor } from './ServiceDescriptor';

export { ConstantType } from './ConstantType';
export type { CtorDescriptor, FactoryDescriptor, ValueDescriptor } from './ServiceDescriptor';

export type ServiceDescriptor<Scopes> = Descriptor<Scopes>;

/** The descriptor constructors and the operations over them, under the name of the type itself. */
export const ServiceDescriptor: typeof factories & typeof op = { ...factories, ...op };

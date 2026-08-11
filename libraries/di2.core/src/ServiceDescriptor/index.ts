import type { ServiceDescriptor as Descriptor } from './expressions';
import * as factories from './factories';
import * as op from './op';

export type { CtorServiceDescriptor, FactoryServiceDescriptor, ValuedServiceDescriptor } from './expressions';
export * from './Signature';

export type ServiceDescriptor<Scopes extends string> = Descriptor<Scopes>;

/** The descriptor constructors and the operations over them, under the name of the type itself. */
export const ServiceDescriptor: typeof factories & typeof op = { ...factories, ...op };
